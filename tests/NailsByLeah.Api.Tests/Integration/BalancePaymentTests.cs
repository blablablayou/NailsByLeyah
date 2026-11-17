using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// The client pays the balance online before the appointment, on the same payment page as the deposit, and a refund
/// can then go back to both online payments.
/// </summary>
public sealed class BalancePaymentTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    /// <summary>A booking whose PHP 150 deposit was paid online and that Leyah has confirmed.</summary>
    private async Task<(int Id, TestUser User, HttpClient Admin, decimal Balance)> Confirmed()
    {
        var (id, session, user, _) = await factory.HoldAsync();
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m, paymentId: $"py-dep-{id}"));
        var admin = await factory.CreateAdminClientAsync();
        var confirmed = await (await admin.PostAsync($"/api/admin/bookings/{id}/confirm", null)).ReadAsync<BookingResponse>();
        Assert.True(confirmed.BalanceDue > 0);
        return (id, user, admin, confirmed.BalanceDue);
    }

    private static Task<HttpResponseMessage> StartBalance(HttpClient client, int id, PaymentMethod method = PaymentMethod.Maya) =>
        client.PostJsonAsync($"/api/bookings/{id}/balance/checkout", new BalanceCheckoutRequest(method));

    private static object BalancePaid(string sessionId, string reference, decimal amount, string paymentId) => new
    {
        @event = "payment_session.completed",
        business_id = "biz-test",
        created = "2026-11-02T00:05:00Z",
        data = new { payment_session_id = sessionId, reference_id = reference, status = "COMPLETED", amount, currency = "PHP", payment_id = paymentId },
    };

    /// <summary>Starts a balance page and reports it paid, as Xendit's notification would.</summary>
    private async Task PayBalance(int id, TestUser user, decimal balance)
    {
        await (await StartBalance(user.Client, id)).ShouldHaveStatus(HttpStatusCode.OK);
        var request = factory.Checkout.LastRequest!;
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        await factory.PostWebhookAsync(BalancePaid(session, request.Reference, balance, $"py-bal-{id}"));
    }

    [Fact]
    public async Task A_confirmed_booking_offers_it_and_the_page_asks_for_the_balance_in_the_chosen_channel()
    {
        var (id, user, _, balance) = await Confirmed();
        Assert.True((await user.Client.GetAsync<BookingResponse>($"/api/bookings/{id}")).CanPayBalanceOnline);

        var started = await StartBalance(user.Client, id);

        await started.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.StartsWith("https://checkout.test/", (await started.ReadAsync<CheckoutResponse>()).CheckoutUrl);
        var request = factory.Checkout.LastRequest!;
        Assert.Equal((id, balance, PaymentMethod.Maya), (request.BookingId, request.Amount, request.Method));
        Assert.True(HostedCheckoutReference.TryParseBalance(request.Reference, out var forBooking) && forBooking == id);
        Assert.Contains($"booking={id}", request.SuccessUrl);
        Assert.Contains("for=balance", request.SuccessUrl);
        Assert.Equal(BookingStatus.Confirmed, factory.Load(id).Status);
    }

    [Fact]
    public async Task Paid_it_becomes_a_second_payment_the_balance_is_zero_and_a_repeat_changes_nothing()
    {
        var (id, user, admin, balance) = await Confirmed();

        await PayBalance(id, user, balance);
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        await factory.PostWebhookAsync(BalancePaid(session, factory.Checkout.LastRequest!.Reference, balance, $"py-bal-{id}")); // sent again

        var payments = factory.PaymentsOf(id);
        Assert.Equal(2, payments.Count);
        var second = Assert.Single(payments, p => p.Option == PaymentOption.Balance);
        Assert.Equal((balance, PaymentMethod.Maya, $"py-bal-{id}"), (second.Amount, second.Method, second.ReferenceNumber));
        var booking = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}");
        Assert.Equal(0m, booking.BalanceDue);
        Assert.Equal(150m + balance, booking.Payment!.AmountPaid);
        Assert.Equal(balance, booking.Payment.BalancePaidOnline);
        Assert.Equal("Confirmed", booking.Status);
        Assert.False((await user.Client.GetAsync<BookingResponse>($"/api/bookings/{id}")).CanPayBalanceOnline);
        Assert.Single(factory.Notifications.BalancePaidIds, x => x == id);
        Assert.Equal(HttpStatusCode.Conflict, (await StartBalance(user.Client, id)).StatusCode); // nothing left to pay
    }

    [Fact]
    public async Task The_return_page_asks_and_records_it_when_the_notification_is_late()
    {
        var (id, user, _, balance) = await Confirmed();
        await (await StartBalance(user.Client, id, PaymentMethod.GCash)).ShouldHaveStatus(HttpStatusCode.OK);
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        var waiting = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/balance/status");
        Assert.Equal("Waiting", waiting.Status);

        factory.Checkout.Statuses[session] = new CheckoutStatus(session, CheckoutState.Paid, $"py-late-{id}", balance, "PHP",
            factory.Checkout.LastRequest!.Reference);
        factory.Clock.Advance(TimeSpan.FromSeconds(6)); // the server asks at most every 5 seconds per page

        var paid = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/balance/status");

        Assert.Equal("Paid", paid.Status);
        Assert.Equal(0m, (await user.Client.GetAsync<BookingResponse>($"/api/bookings/{id}")).BalanceDue);
    }

    [Fact]
    public async Task Not_offered_before_Leyah_confirms_nor_for_someone_elses_booking_nor_after_a_full_payment()
    {
        var (pending, _, user, _) = await factory.HoldAsync();
        var pendingSession = factory.WithDb(db => db.Bookings.Single(b => b.Id == pending).CheckoutSessionId!);
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(pendingSession, pending, 150m, paymentId: $"py-p-{pending}"));
        Assert.False((await user.Client.GetAsync<BookingResponse>($"/api/bookings/{pending}")).CanPayBalanceOnline);
        Assert.Equal("invalid_status", (await (await StartBalance(user.Client, pending)).ReadProblemAsync()).ProblemCode());

        var (id, _, _, _) = await Confirmed();
        Assert.Equal(HttpStatusCode.NotFound, (await StartBalance(user.Client, id)).StatusCode);

        var (full, fullSession, fullUser, _) = await factory.HoldAsync(PaymentOption.Full);
        var total = factory.Checkout.Requests.Last(r => r.BookingId == full).Amount; // what the full-payment page asked for
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(fullSession, full, total, paymentId: $"py-f-{full}"));
        var admin = await factory.CreateAdminClientAsync();
        await (await admin.PostAsync($"/api/admin/bookings/{full}/confirm", null)).ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("no_balance_due", (await (await StartBalance(fullUser.Client, full)).ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task Paid_after_the_booking_was_cancelled_changes_nothing_and_Leyah_is_told()
    {
        var (id, user, admin, balance) = await Confirmed();
        await (await StartBalance(user.Client, id)).ShouldHaveStatus(HttpStatusCode.OK);
        var reference = factory.Checkout.LastRequest!.Reference;
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ShouldHaveStatus(HttpStatusCode.OK);

        await factory.PostWebhookAsync(BalancePaid(session, reference, balance, $"py-after-{id}"));

        Assert.Single(factory.PaymentsOf(id));
        Assert.Equal(150m, factory.Load(id).AmountPaid);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.EntityId == id.ToString() && a.Details!.Contains("needs a manual refund"))));
    }

    [Fact]
    public async Task A_payment_that_cant_be_accepted_is_noted_once_and_the_client_is_told_it_comes_back()
    {
        var (id, user, admin, balance) = await Confirmed();
        await (await StartBalance(user.Client, id)).ShouldHaveStatus(HttpStatusCode.OK);
        var reference = factory.Checkout.LastRequest!.Reference;
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ShouldHaveStatus(HttpStatusCode.OK);

        // Xendit reports it twice, and the client's page keeps asking.
        await factory.PostWebhookAsync(BalancePaid(session, reference, balance, $"py-late-{id}"));
        await factory.PostWebhookAsync(BalancePaid(session, reference, balance, $"py-late-{id}"));
        factory.Checkout.Statuses[session] = new CheckoutStatus(session, CheckoutState.Paid, $"py-late-{id}", balance, "PHP", reference);
        factory.Clock.Advance(TimeSpan.FromSeconds(6));
        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/balance/status");

        Assert.Equal(("PaidRefundDue", balance), (status.Status, status.Amount));
        Assert.Equal(1, factory.WithDb(db => db.AuditLogs.Count(a => a.EntityId == id.ToString() && a.Details!.Contains("needs a manual refund"))));
    }

    [Fact]
    public async Task Paying_again_after_a_payment_that_wasnt_accepted_says_it_comes_back_not_already_paid()
    {
        var (id, user, _, balance) = await Confirmed();
        await (await StartBalance(user.Client, id)).ShouldHaveStatus(HttpStatusCode.OK);
        var reference = factory.Checkout.LastRequest!.Reference;
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        factory.Checkout.Statuses[session] = new CheckoutStatus(session, CheckoutState.Paid, $"py-short-{id}", balance - 1, "PHP", reference); // not the amount due

        var first = await StartBalance(user.Client, id);
        var second = await StartBalance(user.Client, id);

        Assert.Equal("balance_payment_refund_due", (await first.ReadProblemAsync()).ProblemCode());
        Assert.Equal("balance_payment_refund_due", (await second.ReadProblemAsync()).ProblemCode());
        Assert.Equal(balance, factory.Load(id).BalanceDue);
        Assert.Equal(1, factory.WithDb(db => db.AuditLogs.Count(a => a.EntityId == id.ToString() && a.Details!.Contains("needs a manual refund"))));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Cancelling_closes_a_balance_page_the_client_still_has_open(bool bySalon)
    {
        var (id, user, admin, _) = await Confirmed();
        await (await StartBalance(user.Client, id)).ShouldHaveStatus(HttpStatusCode.OK);
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);

        var cancelled = bySalon
            ? await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel", new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))
            : await user.Client.PostJsonAsync($"/api/bookings/{id}/cancel", new ClientCancelRequest(ClientCancellationReason.Emergency));

        await cancelled.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Contains(session, factory.Checkout.Expired);
    }

    [Fact]
    public async Task Cancelling_leaves_the_paid_deposit_page_alone()
    {
        var (id, _, admin, _) = await Confirmed(); // its only page is the deposit's, already paid
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).CheckoutSessionId!);
        factory.Checkout.MarkPaid(session, 150m);

        await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.DoesNotContain(session, factory.Checkout.Expired);
    }

    [Fact]
    public async Task Clients_cannot_choose_Balance_when_booking()
    {
        var user = await factory.CreateClientAsync();

        var response = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking(factory.NextSlot()) with { PaymentOption = PaymentOption.Balance });

        await response.ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    // ---- Refunds across both payments ----

    private static object RefundSucceeded(string refundId, string reference) => new
    {
        @event = "refund.succeeded",
        business_id = "biz-test",
        created = "2026-11-02T01:00:00Z",
        api_version = "v3",
        data = new { refund_id = refundId, reference_id = reference, status = "SUCCEEDED", currency = "PHP" },
    };

    private async Task<BookingResponse> SucceedLastRefund(HttpClient admin, int id)
    {
        var (refundId, outcome) = factory.Checkout.Refunds.OrderBy(r => int.Parse(r.Key["rfd-test-".Length..])).Last();
        await (await factory.PostWebhookAsync(RefundSucceeded(refundId, outcome.Reference!))).ShouldHaveStatus(HttpStatusCode.OK);
        return await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}");
    }

    [Fact]
    public async Task Leyah_cancelling_sends_the_balance_back_then_the_deposit_as_one_refund()
    {
        var (id, user, admin, balance) = await Confirmed();
        await PayBalance(id, user, balance);
        var cancelled = await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ReadAsync<BookingResponse>();
        Assert.Equal(150m + balance, cancelled.Payment!.RefundDue);

        await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null)).ShouldHaveStatus(HttpStatusCode.OK);
        var first = factory.Checkout.RefundRequests.Single(r => r.PaymentId == $"py-bal-{id}");
        Assert.Equal(balance, first.Amount);

        var halfway = await SucceedLastRefund(admin, id);
        Assert.Equal("Processing", halfway.Payment!.RefundStatus); // the deposit part was sent at once
        Assert.Equal(balance, halfway.Payment.RefundedOnline);
        var second = factory.Checkout.RefundRequests.Single(r => r.PaymentId == $"py-dep-{id}");
        Assert.Equal(150m, second.Amount);
        Assert.DoesNotContain(id, factory.Notifications.RefundSentIds);

        var done = await SucceedLastRefund(admin, id);
        Assert.Equal("Succeeded", done.Payment!.RefundStatus);
        Assert.NotNull(done.Payment.RefundSentAt);
        Assert.Equal(150m + balance, done.Payment.RefundedOnline);
        Assert.Single(factory.Notifications.RefundSentIds, x => x == id);
    }

    [Fact]
    public async Task A_client_cancelling_gets_only_the_balance_back_and_the_deposit_is_kept()
    {
        var (id, user, admin, balance) = await Confirmed();
        await PayBalance(id, user, balance);
        var cancelled = await (await user.Client.PostJsonAsync($"/api/bookings/{id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.Emergency))).ReadAsync<BookingResponse>();
        Assert.Equal(balance, cancelled.Payment!.RefundDue);

        await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null)).ShouldHaveStatus(HttpStatusCode.OK);
        var done = await SucceedLastRefund(admin, id);

        var only = Assert.Single(factory.Checkout.RefundRequests, r => r.PaymentId.EndsWith($"-{id}", StringComparison.Ordinal));
        Assert.Equal(($"py-bal-{id}", balance), (only.PaymentId, only.Amount));
        Assert.Equal("Succeeded", done.Payment!.RefundStatus);
    }

    [Fact]
    public async Task If_the_second_part_fails_trying_again_sends_only_the_rest()
    {
        var (id, user, admin, balance) = await Confirmed();
        await PayBalance(id, user, balance);
        await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel", new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null));
        await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null)).ShouldHaveStatus(HttpStatusCode.OK);

        factory.Checkout.RefuseNextRefund(); // the deposit part is refused
        var failed = await SucceedLastRefund(admin, id);

        Assert.Equal("Failed", failed.Payment!.RefundStatus);
        Assert.Equal(balance, failed.Payment.RefundedOnline);

        await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null)).ShouldHaveStatus(HttpStatusCode.OK);
        var retried = factory.Checkout.RefundRequests.Where(r => r.PaymentId == $"py-dep-{id}").ToList();
        Assert.Equal(2, retried.Count);
        Assert.All(retried, r => Assert.Equal(150m, r.Amount));
        Assert.Single(factory.Checkout.RefundRequests, r => r.PaymentId == $"py-bal-{id}"); // never sent twice
    }
}
