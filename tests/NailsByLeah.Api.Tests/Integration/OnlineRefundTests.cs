using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// A refund sent back online, to the GCash or Maya account the client paid from on Xendit's page. Xendit answers
/// Pending, then its notification (or a check) says Succeeded or Failed. Leyah can still send any refund herself.
/// Its own database, because one test moves the clock forward an hour.
/// </summary>
public sealed class OnlineRefundTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    /// <summary>A booking paid ₱150 on Xendit's page, then cancelled by the salon: all ₱150 is owed back.</summary>
    private async Task<(int Id, HttpClient Admin, string PaymentId)> PaidThenCancelledBySalon()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        var paymentId = $"py-refund-{id}";
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m, paymentId: paymentId));
        var admin = await factory.CreateAdminClientAsync();
        var cancelled = await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ReadAsync<BookingResponse>();
        Assert.Equal(150m, cancelled.Payment!.RefundDue);
        Assert.True(cancelled.Payment.CanRefundOnline);
        return (id, admin, paymentId);
    }

    private static object RefundEvent(string evt, string refundId, int bookingId, string status, string? failureCode = null) => new
    {
        @event = evt,
        business_id = "biz-test",
        created = "2026-11-02T01:00:00Z",
        api_version = "v3",
        data = new
        {
            refund_id = refundId,
            reference_id = $"booking-{bookingId}-refund-20261102010000",
            status,
            amount = 150,
            currency = "PHP",
            failure_code = failureCode,
        },
    };

    private static async Task<BookingResponse> RefundOnline(HttpClient admin, int id)
    {
        var response = await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null);
        await response.ShouldHaveStatus(HttpStatusCode.OK);
        return await response.ReadAsync<BookingResponse>();
    }

    [Fact]
    public async Task Sending_it_online_asks_Xendit_for_the_amount_owed_then_its_notification_marks_it_sent()
    {
        var (id, admin, paymentId) = await PaidThenCancelledBySalon();

        var processing = await RefundOnline(admin, id);

        var request = factory.Checkout.RefundRequests.Single(r => r.PaymentId == paymentId);
        Assert.Equal((150m, RefundReason.Cancellation), (request.Amount, request.Reason));
        Assert.True(HostedCheckoutReference.TryParseRefund(request.Reference, out var forBooking) && forBooking == id);
        Assert.Equal("Processing", processing.Payment!.RefundStatus);
        Assert.Null(processing.Payment.RefundSentAt);
        var refundId = processing.Payment.RefundReference!;
        Assert.StartsWith("rfd-test-", refundId);
        Assert.DoesNotContain(id, factory.Notifications.RefundSentIds); // not told while it is still on its way

        var notified = await factory.PostWebhookAsync(RefundEvent("refund.succeeded", refundId, id, "SUCCEEDED"));
        await factory.PostWebhookAsync(RefundEvent("refund.succeeded", refundId, id, "SUCCEEDED")); // Xendit sending it again

        Assert.Equal(HttpStatusCode.OK, notified.StatusCode);
        var done = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}");
        Assert.Equal(("Succeeded", refundId), (done.Payment!.RefundStatus, done.Payment.RefundReference));
        Assert.NotNull(done.Payment.RefundSentAt);
        Assert.DoesNotContain((await admin.GetAsync<DashboardResponse>("/api/admin/dashboard")).Attention, a => a.Booking.Id == id);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "RefundSent" && a.EntityId == id.ToString())));
        Assert.Single(factory.Notifications.RefundSentIds, x => x == id); // told once, when it arrived
    }

    [Fact]
    public async Task A_second_click_while_it_is_processing_sends_nothing_more()
    {
        var (id, admin, paymentId) = await PaidThenCancelledBySalon();
        await RefundOnline(admin, id);

        var again = await admin.PostAsync($"/api/admin/bookings/{id}/refund/online", null);
        var byHand = await admin.PostJsonAsync($"/api/admin/bookings/{id}/refund", new RecordRefundRequest("GC-1"));

        await again.ShouldHaveStatus(HttpStatusCode.Conflict);
        await byHand.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Single(factory.Checkout.RefundRequests, r => r.PaymentId == paymentId);
    }

    [Fact]
    public async Task A_refused_refund_is_marked_failed_and_Leyah_can_send_it_herself()
    {
        var (id, admin, _) = await PaidThenCancelledBySalon();
        factory.Checkout.RefuseNextRefund();

        var failed = await RefundOnline(admin, id);

        Assert.Equal("Failed", failed.Payment!.RefundStatus);
        Assert.Null(failed.Payment.RefundSentAt);
        Assert.DoesNotContain(id, factory.Notifications.RefundSentIds);
        Assert.Contains((await admin.GetAsync<DashboardResponse>("/api/admin/dashboard")).Attention, a => a.Kind == "RefundDue" && a.Booking.Id == id);

        var sent = await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/refund", new RecordRefundRequest("GC-BYHAND-1"))).ReadAsync<BookingResponse>();
        Assert.Equal(((string?)null, "GC-BYHAND-1"), (sent.Payment!.RefundStatus, sent.Payment.RefundReference));
        Assert.NotNull(sent.Payment.RefundSentAt);
    }

    [Fact]
    public async Task A_failed_notification_lets_her_try_again_and_a_late_one_for_the_old_try_changes_nothing()
    {
        var (id, admin, paymentId) = await PaidThenCancelledBySalon();
        var first = (await RefundOnline(admin, id)).Payment!.RefundReference!;

        await factory.PostWebhookAsync(RefundEvent("refund.failed", first, id, "FAILED", "ACCOUNT_NOT_FOUND"));
        Assert.Equal("Failed", (await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}")).Payment!.RefundStatus);

        factory.Checkout.NextRefundState = ProviderRefundState.Succeeded;
        try
        {
            var second = await RefundOnline(admin, id);
            Assert.Equal("Succeeded", second.Payment!.RefundStatus);
            Assert.NotEqual(first, second.Payment.RefundReference);
        }
        finally
        {
            factory.Checkout.NextRefundState = ProviderRefundState.Pending;
        }

        await factory.PostWebhookAsync(RefundEvent("refund.failed", first, id, "FAILED")); // Xendit retrying the old news
        var after = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}");
        Assert.Equal("Succeeded", after.Payment!.RefundStatus);
        Assert.Equal(2, factory.Checkout.RefundRequests.Count(r => r.PaymentId == paymentId));
        Assert.Equal(2, factory.Checkout.RefundRequests.Where(r => r.PaymentId == paymentId).Select(r => r.Reference).Distinct().Count());
    }

    [Fact]
    public async Task Checking_asks_Xendit_when_its_notification_is_slow()
    {
        var (id, admin, _) = await PaidThenCancelledBySalon();
        var refundId = (await RefundOnline(admin, id)).Payment!.RefundReference!;

        var stillWaiting = await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/check", null)).ReadAsync<BookingResponse>();
        Assert.Equal("Processing", stillWaiting.Payment!.RefundStatus);

        factory.Checkout.Refunds[refundId] = factory.Checkout.Refunds[refundId] with { State = ProviderRefundState.Succeeded };
        var done = await (await admin.PostAsync($"/api/admin/bookings/{id}/refund/check", null)).ReadAsync<BookingResponse>();
        Assert.Equal("Succeeded", done.Payment!.RefundStatus);
        Assert.NotNull(done.Payment.RefundSentAt);
    }

    [Fact]
    public async Task With_no_answer_at_all_it_stays_processing_until_the_notification_and_is_released_after_an_hour()
    {
        var (id, admin, _) = await PaidThenCancelledBySalon();
        factory.Checkout.NoAnswerNextRefund();

        var unknown = await RefundOnline(admin, id);
        Assert.Equal(("Processing", (string?)null), (unknown.Payment!.RefundStatus, unknown.Payment.RefundReference));

        // The refund did reach Xendit: its notification still finds the booking by our reference.
        await factory.PostWebhookAsync(RefundEvent("refund.succeeded", "rfd-late-1", id, "SUCCEEDED"));
        var settled = await admin.GetAsync<BookingResponse>($"/api/admin/bookings/{id}");
        Assert.Equal(("Succeeded", "rfd-late-1"), (settled.Payment!.RefundStatus, settled.Payment.RefundReference));

        var (other, otherAdmin, _) = await PaidThenCancelledBySalon();
        factory.Checkout.NoAnswerNextRefund();
        await RefundOnline(otherAdmin, other);
        factory.Clock.Advance(OnlineRefundServiceHour + TimeSpan.FromMinutes(1));
        var later = await factory.CreateAdminClientAsync(); // an hour idle signs Leyah out, so she signs in again
        var released = await (await later.PostAsync($"/api/admin/bookings/{other}/refund/check", null)).ReadAsync<BookingResponse>();
        Assert.Equal("Failed", released.Payment!.RefundStatus);
    }

    private static readonly TimeSpan OnlineRefundServiceHour = Services.OnlineRefundService.UnansweredAfter;

    [Fact]
    public async Task A_booking_not_paid_on_Xendits_page_cannot_go_back_online()
    {
        var admin = await factory.CreateAdminClientAsync();
        var (date, time) = factory.NextSlot();
        var walkIn = await (await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(
            1, date, time, GuestName: "Ana Santos", GuestPhone: "09171112222", NailColor: TestHelpers.Color,
            Paid: "Deposit", PaymentMethod: PaymentMethod.Cash))).ReadAsync<BookingResponse>();
        var cancelled = await (await admin.PostJsonAsync($"/api/admin/bookings/{walkIn.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ReadAsync<BookingResponse>();

        Assert.True(cancelled.Payment!.RefundDue > 0);
        Assert.False(cancelled.Payment.CanRefundOnline); // paid in cash at the salon
        var response = await admin.PostAsync($"/api/admin/bookings/{walkIn.Id}/refund/online", null);
        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Clients_cannot_send_refunds_and_notifications_need_the_token()
    {
        var (id, _, _) = await PaidThenCancelledBySalon();
        var client = (await factory.CreateClientAsync()).Client;

        var byClient = await client.PostAsync($"/api/admin/bookings/{id}/refund/online", null);
        var noToken = await factory.PostWebhookAsync(RefundEvent("refund.succeeded", "rfd-x", id, "SUCCEEDED"), token: null);

        Assert.Equal(HttpStatusCode.Forbidden, byClient.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, noToken.StatusCode);
        Assert.Null(factory.Load(id).RefundStatus);
    }

    private DateOnly Today => DateOnly.FromDateTime(factory.Clock.GetUtcNow().AddHours(8).DateTime);

    private Task<DailySalesReport> TodaysReport(HttpClient admin) =>
        admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={Today:yyyy-MM-dd}");

    [Fact]
    public async Task The_report_takes_off_an_online_refund_only_once_it_has_arrived()
    {
        var (id, admin, _) = await PaidThenCancelledBySalon();
        var before = (await TodaysReport(admin)).RefundsSent;

        var refundId = (await RefundOnline(admin, id)).Payment!.RefundReference!;
        Assert.Equal(before, (await TodaysReport(admin)).RefundsSent); // still on its way

        await factory.PostWebhookAsync(RefundEvent("refund.succeeded", refundId, id, "SUCCEEDED"));

        var today = await TodaysReport(admin);
        Assert.Equal(before + 150m, today.RefundsSent);
        var month = await admin.GetAsync<MonthlySalesReport>($"/api/admin/reports/monthly?year={Today.Year}&month={Today.Month}");
        Assert.Equal(month.Days.Sum(d => d.RefundsSent), month.RefundsSent);
        Assert.True(month.RefundsSent >= today.RefundsSent);
    }

    [Fact]
    public async Task The_report_takes_off_a_refund_Leyah_sent_by_hand_on_the_day_she_sent_it()
    {
        var (id, admin, _) = await PaidThenCancelledBySalon();
        var before = (await TodaysReport(admin)).RefundsSent;

        await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/refund", new RecordRefundRequest("GC-9"))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.Equal(before + 150m, (await TodaysReport(admin)).RefundsSent);
    }
}
