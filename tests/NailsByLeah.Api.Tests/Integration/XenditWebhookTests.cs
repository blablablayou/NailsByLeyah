using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Helpers shared by the tests that receive Xendit's notifications.</summary>
internal static class XenditTestKit
{
    public static async Task<(int BookingId, string SessionId, TestUser User, CreateBookingRequest Request)> HoldAsync(
        this ApiFactory factory, PaymentOption option = PaymentOption.Deposit)
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot()) with { PaymentOption = option };
        var held = await user.Client.BookAsync(request);
        var session = factory.WithDb(db => db.Bookings.Single(b => b.Id == held.Booking.Id).CheckoutSessionId!);
        return (held.Booking.Id, session, user, request);
    }

    public static object PaidEvent(string sessionId, int bookingId, decimal amount, string currency = "PHP", string? paymentId = null) => new
    {
        @event = "payment_session.completed",
        business_id = "biz-test",
        created = "2026-11-02T00:05:00Z",
        data = new
        {
            payment_session_id = sessionId,
            reference_id = $"booking-{bookingId}",
            status = "COMPLETED",
            amount,
            currency,
            payment_id = paymentId ?? $"py-{bookingId}-{sessionId}",
        },
    };

    public static async Task<HttpResponseMessage> PostWebhookAsync(this ApiFactory factory, object payload, string? token = XenditApiFactory.CallbackToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments/xendit/webhook") { Content = JsonContent.Create(payload) };
        if (token is not null)
            request.Headers.Add("x-callback-token", token);
        return await factory.NewClient().SendAsync(request);
    }

    /// <summary>The hold ran out (what the expiry job leaves behind).</summary>
    public static void ExpireInDb(this ApiFactory factory, int bookingId, string reason = SystemCancellationReasons.PaymentNotCompleted) =>
        factory.WithDb(db =>
        {
            var b = db.Bookings.Single(x => x.Id == bookingId);
            b.Status = BookingStatus.Cancelled;
            db.Cancellations.Add(new Cancellation { BookingId = b.Id, CancelledByUserId = b.ClientId, Reason = reason, CancelledAt = b.CreatedAt });
            return db.SaveChanges();
        });

    public static Booking Load(this ApiFactory factory, int bookingId) =>
        factory.WithDb(db => db.Bookings.Single(b => b.Id == bookingId));

    public static List<Payment> PaymentsOf(this ApiFactory factory, int bookingId) =>
        factory.WithDb(db => db.Payments.Where(p => p.BookingId == bookingId).ToList());
}

/// <summary>Xendit's notification that a client paid: only it (or the server asking Xendit) marks a booking paid.</summary>
public sealed class XenditWebhookTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    [Fact]
    public async Task A_missing_or_wrong_token_changes_nothing()
    {
        var (id, session, _, _) = await factory.HoldAsync();

        var none = await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m), token: null);
        var wrong = await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m), token: "not-the-token");

        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(BookingStatus.AwaitingPayment, factory.Load(id).Status);
        Assert.Empty(factory.PaymentsOf(id));
    }

    [Fact]
    public async Task A_paid_event_makes_it_a_paid_booking()
    {
        var (id, session, user, _) = await factory.HoldAsync();

        var response = await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m, paymentId: $"py-paid-{id}"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var booking = factory.Load(id);
        var payment = Assert.Single(factory.PaymentsOf(id));
        Assert.Equal((BookingStatus.Pending, 150m), (booking.Status, booking.AmountPaid));
        Assert.Equal((PaymentStatus.Succeeded, $"py-paid-{id}", 150m, PaymentMethod.GCash), (payment.Status, payment.ReferenceNumber, payment.Amount, payment.Method));
        var receipt = await user.Client.GetAsync<ReceiptResponse>($"/api/bookings/{id}/receipt");
        Assert.Equal($"py-paid-{id}", receipt.ReferenceNumber);
        Assert.Contains(id, factory.Notifications.ConfirmedBookingIds);
        Assert.Contains(id, factory.Notifications.SalonNewBookingIds);
    }

    [Fact]
    public async Task The_same_event_twice_records_one_payment()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        var paid = XenditTestKit.PaidEvent(session, id, 150m);

        var first = await factory.PostWebhookAsync(paid);
        var second = await factory.PostWebhookAsync(paid);

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (first.StatusCode, second.StatusCode));
        Assert.Single(factory.PaymentsOf(id));
        Assert.Single(factory.Notifications.ConfirmedBookingIds, x => x == id);
    }

    [Fact]
    public async Task A_wrong_amount_or_currency_is_not_accepted()
    {
        var (id, session, _, _) = await factory.HoldAsync();

        var lower = await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 1m));
        var otherCurrency = await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m, currency: "USD"));

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (lower.StatusCode, otherCurrency.StatusCode));
        Assert.Equal(BookingStatus.AwaitingPayment, factory.Load(id).Status);
        Assert.Empty(factory.PaymentsOf(id));
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.EntityId == id.ToString() && a.Details!.Contains("amount mismatch"))));
        Assert.Contains("did not match", factory.Notifications.SalonCancellationReasons[id], StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task A_paid_event_before_the_session_id_was_saved_still_finds_the_booking()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        factory.WithDb(db =>
        {
            var b = db.Bookings.Single(x => x.Id == id);
            b.CheckoutSessionId = null;
            return db.SaveChanges();
        });

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
    }

    [Fact]
    public async Task A_full_payment_is_checked_against_the_full_amount()
    {
        var (id, session, _, _) = await factory.HoldAsync(PaymentOption.Full);
        var total = factory.WithDb(db => db.Bookings.Single(b => b.Id == id).ServicePrice);

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, total));

        var booking = factory.Load(id);
        Assert.Equal((BookingStatus.Pending, PaymentOption.Full, total), (booking.Status, booking.PaymentOption, booking.AmountPaid));
    }

    [Fact]
    public async Task Paid_after_the_hold_ran_out_is_reinstated_if_the_slot_is_free()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        factory.ExpireInDb(id);

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        var booking = factory.WithDb(db => db.Bookings.Where(b => b.Id == id).Select(b => new { b.Status, HasCancellation = b.Cancellation != null }).Single());
        Assert.Equal((BookingStatus.Pending, false), (booking.Status, booking.HasCancellation));
        Assert.Single(factory.PaymentsOf(id));
    }

    [Fact]
    public async Task Paid_after_the_hold_ran_out_and_the_slot_was_taken_needs_a_refund()
    {
        var (id, session, _, request) = await factory.HoldAsync();
        factory.ExpireInDb(id);
        var other = await factory.CreateClientAsync();
        await other.Client.BookAsync(TestHelpers.NewBooking((request.BookingDate, request.StartTime)));

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        var booking = factory.Load(id);
        Assert.Equal((BookingStatus.Cancelled, 150m, 150m), (booking.Status, booking.AmountPaid, booking.RefundDue));
        Assert.Single(factory.PaymentsOf(id));
        Assert.Contains("refund", factory.Notifications.SalonCancellationReasons[id], StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Paid_after_the_client_cancelled_needs_a_refund()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        factory.ExpireInDb(id, reason: nameof(ClientCancellationReason.ChangeOfSchedule));

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        var booking = factory.Load(id);
        Assert.Equal((BookingStatus.Cancelled, 150m), (booking.Status, booking.RefundDue));
        Assert.Contains(id, factory.Notifications.SalonCancellationReasons.Keys);
    }

    [Fact]
    public async Task Paid_for_a_time_already_passed_needs_a_refund()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        factory.ExpireInDb(id);
        factory.WithDb(db =>
        {
            db.Bookings.Single(b => b.Id == id).BookingDate = ApiFactory.StartDate.AddDays(-1);
            return db.SaveChanges();
        });

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        Assert.Equal((BookingStatus.Cancelled, 150m), (factory.Load(id).Status, factory.Load(id).RefundDue));
    }

    [Fact]
    public async Task A_second_payment_for_an_already_paid_booking_alerts_Leyah()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m, paymentId: $"py-first-{id}"));

        await factory.PostWebhookAsync(XenditTestKit.PaidEvent("ps-other-page", id, 150m, paymentId: $"py-second-{id}"));

        Assert.Single(factory.PaymentsOf(id));
        Assert.Contains("second payment", factory.Notifications.SalonCancellationReasons[id], StringComparison.OrdinalIgnoreCase);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.EntityId == id.ToString() && a.Details!.Contains($"py-second-{id}"))));
    }

    [Fact]
    public async Task An_unknown_booking_or_event_is_acknowledged_and_ignored()
    {
        var unknown = await factory.PostWebhookAsync(XenditTestKit.PaidEvent("ps-unknown", 999999, 150m));
        var other = await factory.PostWebhookAsync(new { @event = "payment_session.expired", data = new { reference_id = "booking-999999" } });

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (unknown.StatusCode, other.StatusCode));
    }
}

/// <summary>Leyah switched back to simulated payments, but kept the Xendit keys: holds already on Xendit still finish.</summary>
public sealed class SimulatedWithXenditKeysApiFactory : ApiFactory
{
    protected override void ConfigureSettings(IWebHostBuilder builder)
    {
        builder.UseSetting("Payments:Provider", "Simulated");
        builder.UseSetting("Xendit:SecretKey", "xnd_development_test");
        builder.UseSetting("Xendit:CallbackToken", XenditApiFactory.CallbackToken);
    }
}

public sealed class XenditWebhookAfterSwitchBackTests(SimulatedWithXenditKeysApiFactory factory) : IClassFixture<SimulatedWithXenditKeysApiFactory>
{
    [Fact]
    public async Task A_hold_finishes_even_after_switching_back_to_simulated()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var id = booked.Booking.Id;
        factory.WithDb(db =>
        {
            db.Payments.RemoveRange(db.Payments.Where(p => p.BookingId == id));
            var b = db.Bookings.Single(x => x.Id == id);
            b.HoldForPayment(Guid.NewGuid(), PaymentMethod.GCash, PaymentOption.Deposit, b.CreatedAt.AddMinutes(15));
            b.AmountPaid = 0;
            b.CheckoutSessionId = "ps-before-switch";
            return db.SaveChanges();
        });

        var response = await factory.PostWebhookAsync(XenditTestKit.PaidEvent("ps-before-switch", id, 150m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
    }

    [Fact]
    public async Task The_same_pay_click_after_switching_back_returns_its_hold()
    {
        var user = await factory.CreateClientAsync();
        var request = TestHelpers.NewBooking(factory.NextSlot());
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var id = booked.Booking.Id;
        factory.WithDb(db =>
        {
            db.Payments.RemoveRange(db.Payments.Where(p => p.BookingId == id));
            var b = db.Bookings.Single(x => x.Id == id);
            b.HoldForPayment(request.IdempotencyKey, PaymentMethod.GCash, PaymentOption.Deposit, DateTime.UtcNow.AddMinutes(15));
            b.AmountPaid = 0;
            b.CheckoutSessionId = "ps-held-before-switch";
            b.CheckoutUrl = "https://checkout.test/ps-held-before-switch";
            return db.SaveChanges();
        });

        var again = await user.Client.PostJsonAsync("/api/bookings", request);

        await again.ShouldHaveStatus(HttpStatusCode.OK);
        var result = await again.ReadAsync<CreateBookingResponse>();
        Assert.Equal((id, "https://checkout.test/ps-held-before-switch"), (result.Booking.Id, result.CheckoutUrl));
    }
}
