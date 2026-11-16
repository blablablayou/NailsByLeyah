using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The client is emailed when Leyah cancels or moves their booking, or sends their refund by hand.</summary>
public sealed class SalonActionEmailTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(int Id, HttpClient Client, HttpClient Admin)> Booked(PaymentOption option = PaymentOption.Deposit)
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()) with { PaymentOption = option });
        return (booked.Booking.Id, user.Client, await factory.CreateAdminClientAsync());
    }

    [Fact]
    public async Task Leyah_cancelling_emails_the_client_with_the_reason()
    {
        var (id, _, admin) = await Booked();

        var response = await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, "Leyah is sick today."));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.True(factory.Notifications.ClientCancellations.TryGetValue(id, out var reason));
        Assert.False(string.IsNullOrWhiteSpace(reason));
    }

    [Fact]
    public async Task Leyah_moving_a_booking_emails_the_client_the_old_time()
    {
        var (id, _, admin) = await Booked();
        var before = factory.WithDb(db => db.Bookings.Single(b => b.Id == id));
        var to = factory.NextSlot();

        var response = await admin.PostJsonAsync($"/api/admin/bookings/{id}/reschedule", new RescheduleRequest(to.Date, to.Time));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal((before.BookingDate, before.StartTime), factory.Notifications.ClientMoves[id]);
    }

    [Fact]
    public async Task A_client_changing_their_own_booking_gets_no_salon_action_email()
    {
        var (id, client, _) = await Booked();
        var to = factory.NextSlot();

        await (await client.PostJsonAsync($"/api/bookings/{id}/reschedule", new RescheduleRequest(to.Date, to.Time))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await client.PostJsonAsync($"/api/bookings/{id}/cancel", new ClientCancelRequest(ClientCancellationReason.Emergency))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.False(factory.Notifications.ClientMoves.ContainsKey(id));
        Assert.False(factory.Notifications.ClientCancellations.ContainsKey(id));
    }

    [Fact]
    public async Task A_walk_in_without_an_account_is_cancelled_and_moved_without_an_email_or_an_error()
    {
        var admin = await factory.CreateAdminClientAsync();
        var (date, time) = factory.NextSlot();
        var walkIn = await (await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(
            1, date, time, GuestName: "Ana Santos", GuestPhone: "09171112222", NailColor: TestHelpers.Color,
            Paid: "Deposit", PaymentMethod: PaymentMethod.Cash))).ReadAsync<BookingResponse>();
        var to = factory.NextSlot();

        await (await admin.PostJsonAsync($"/api/admin/bookings/{walkIn.Id}/reschedule", new RescheduleRequest(to.Date, to.Time))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await admin.PostJsonAsync($"/api/admin/bookings/{walkIn.Id}/cancel",
            new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null))).ShouldHaveStatus(HttpStatusCode.OK);

        Assert.False(factory.Notifications.ClientMoves.ContainsKey(walkIn.Id));
        Assert.False(factory.Notifications.ClientCancellations.ContainsKey(walkIn.Id));
    }

    [Fact]
    public async Task Recording_a_refund_sent_by_hand_emails_the_client_once()
    {
        var (id, _, admin) = await Booked();
        await admin.PostJsonAsync($"/api/admin/bookings/{id}/cancel", new AdminCancelRequest(AdminCancellationReason.StaffUnavailable, null));

        await (await admin.PostJsonAsync($"/api/admin/bookings/{id}/refund", new RecordRefundRequest("GC-1"))).ShouldHaveStatus(HttpStatusCode.OK);
        await admin.PostJsonAsync($"/api/admin/bookings/{id}/refund", new RecordRefundRequest(null)); // refused: already recorded

        Assert.Single(factory.Notifications.RefundSentIds, x => x == id);
    }
}
