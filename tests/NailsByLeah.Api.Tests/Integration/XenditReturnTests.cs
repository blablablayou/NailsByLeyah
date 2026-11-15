using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Back from Xendit's page: checking the payment, trying again, or cancelling the hold.</summary>
public sealed class XenditReturnTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    [Fact]
    public async Task A_waiting_hold_reports_waiting_with_its_checkout()
    {
        var (id, session, user, _) = await factory.HoldAsync();

        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/payment-status");

        Assert.Equal("Waiting", status.Status);
        Assert.Equal($"https://checkout.test/{session}", status.CheckoutUrl);
        Assert.NotNull(status.HoldUntil);
    }

    [Fact]
    public async Task Status_check_confirms_a_paid_session_without_the_webhook()
    {
        var (id, session, user, _) = await factory.HoldAsync();
        factory.Checkout.MarkPaid(session, 150m, $"py-status-{id}");

        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/payment-status");

        Assert.Equal("Paid", status.Status);
        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
        Assert.Equal($"py-status-{id}", Assert.Single(factory.PaymentsOf(id)).ReferenceNumber);
    }

    [Fact]
    public async Task An_expired_hold_reports_not_completed()
    {
        var (id, _, user, _) = await factory.HoldAsync();
        factory.ExpireInDb(id);

        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/payment-status");

        Assert.Equal("NotCompleted", status.Status);
        Assert.Null(status.CheckoutUrl);
    }

    [Fact]
    public async Task Try_again_makes_a_new_session_and_cancels_the_old_one()
    {
        var (id, oldSession, user, _) = await factory.HoldAsync();

        var response = await user.Client.PostAsync($"/api/bookings/{id}/checkout", null);

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        var retry = await response.ReadAsync<CheckoutResponse>();
        var booking = factory.Load(id);
        Assert.NotEqual(oldSession, booking.CheckoutSessionId);
        Assert.Equal($"https://checkout.test/{booking.CheckoutSessionId}", retry.CheckoutUrl);
        Assert.Contains(oldSession, factory.Checkout.Expired);
        Assert.Equal(2, factory.Checkout.CreatedFor(id));
        Assert.True(factory.Checkout.LastRequest!.ExpiresAtUtc >= factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(10)); // Xendit's minimum
    }

    [Fact]
    public async Task Try_again_on_a_session_already_paid_confirms_it_instead()
    {
        var (id, session, user, _) = await factory.HoldAsync();
        factory.Checkout.MarkPaid(session, 150m);

        var response = await user.Client.PostAsync($"/api/bookings/{id}/checkout", null);

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("already_paid", (await response.ReadProblemAsync()).ProblemCode());
        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
        Assert.Equal(1, factory.Checkout.CreatedFor(id));
    }

    [Fact]
    public async Task Try_again_after_the_hold_ended_is_refused()
    {
        var (id, _, user, _) = await factory.HoldAsync();
        factory.WithDb(db =>
        {
            db.Bookings.Single(b => b.Id == id).PaymentHoldUntil = factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(-1);
            return db.SaveChanges();
        });

        var response = await user.Client.PostAsync($"/api/bookings/{id}/checkout", null);

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("hold_expired", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task Another_client_cannot_see_or_retry_my_hold()
    {
        var (id, _, _, _) = await factory.HoldAsync();
        var other = await factory.CreateClientAsync();

        var status = await other.Client.GetAsync($"/api/bookings/{id}/payment-status");
        var retry = await other.Client.PostAsync($"/api/bookings/{id}/checkout", null);

        Assert.Equal((HttpStatusCode.NotFound, HttpStatusCode.NotFound), (status.StatusCode, retry.StatusCode));
    }

    [Fact]
    public async Task Cancelling_a_hold_frees_the_slot_and_sends_no_salon_alert()
    {
        var (id, session, user, request) = await factory.HoldAsync();

        var response = await user.Client.PostJsonAsync($"/api/bookings/{id}/cancel",
            new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule, null));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Cancelled", (await response.ReadAsync<BookingResponse>()).Status);
        Assert.Contains(session, factory.Checkout.Expired);
        Assert.DoesNotContain(id, factory.Notifications.SalonCancellationReasons.Keys);
        var other = await factory.CreateClientAsync();
        await other.Client.BookAsync(TestHelpers.NewBooking((request.BookingDate, request.StartTime)));
    }

    [Fact]
    public async Task A_client_charged_after_cancelling_is_told_a_refund_is_coming()
    {
        var (id, session, user, _) = await factory.HoldAsync();
        await user.Client.PostJsonAsync($"/api/bookings/{id}/cancel", new ClientCancelRequest(ClientCancellationReason.ChangeOfSchedule, null));
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));

        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/payment-status");

        Assert.Equal("PaidRefundDue", status.Status);
        Assert.Equal(150m, status.Amount);
    }

    [Fact]
    public async Task Try_again_while_the_earlier_page_cannot_be_closed_is_refused()
    {
        var (id, _, user, _) = await factory.HoldAsync();
        factory.Checkout.FailNextExpire();

        var response = await user.Client.PostAsync($"/api/bookings/{id}/checkout", null);

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("payment_in_progress", (await response.ReadProblemAsync()).ProblemCode());
        Assert.Equal(1, factory.Checkout.CreatedFor(id)); // no second page to pay on
    }

    [Fact]
    public async Task Status_check_finds_a_payment_on_a_hold_that_already_ran_out()
    {
        var (id, session, user, _) = await factory.HoldAsync();
        factory.ExpireInDb(id);
        factory.Checkout.MarkPaid(session, 150m);

        var status = await user.Client.GetAsync<PaymentStatusResponse>($"/api/bookings/{id}/payment-status");

        Assert.Equal("Paid", status.Status);
        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
    }

    [Fact]
    public async Task A_hold_cannot_be_rescheduled()
    {
        var (id, _, user, _) = await factory.HoldAsync();

        var response = await user.Client.PostJsonAsync($"/api/bookings/{id}/reschedule",
            new RescheduleRequest(factory.NextSlot().Date, ApiFactory.SlotTimes[0]));

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("invalid_status", (await response.ReadProblemAsync()).ProblemCode());
    }
}
