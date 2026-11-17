using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// A client books at least 2 hours ahead (Schedule:MinimumNoticeMinutes), so Leyah can confirm and get ready; Leyah's
/// own bookings aren't limited. Its own factory, because the clock is set to 10:00 AM on the first day.
/// </summary>
public sealed class MinimumNoticeTests : IClassFixture<MinimumNoticeTests.Factory>
{
    public sealed class Factory : ApiFactory;

    private readonly Factory _factory;
    private static readonly DateOnly Today = ApiFactory.StartDate;

    public MinimumNoticeTests(Factory factory)
    {
        _factory = factory;
        _factory.Clock.SetUtcNow(ApiFactory.StartTime.AddHours(2)); // 10:00 AM in Manila
    }

    [Fact]
    public async Task A_client_sees_times_within_two_hours_as_too_soon_and_Leyah_sees_them_open()
    {
        var user = await _factory.CreateClientAsync();
        var admin = await _factory.CreateAdminClientAsync();

        var forClient = await user.Client.GetAsync<DaySlotsResponse>($"/api/slots?date={Today:yyyy-MM-dd}&serviceId=1");
        var forLeyah = await admin.GetAsync<DaySlotsResponse>($"/api/slots?date={Today:yyyy-MM-dd}&serviceId=1");

        Assert.Equal(SlotStatuses.TooSoon, forClient.Slots.Single(s => s.StartTime == new TimeOnly(11, 30)).Status);
        Assert.Equal("Book at least 2 hours ahead", forClient.Slots.Single(s => s.StartTime == new TimeOnly(11, 30)).Note);
        // 12:00 is two hours away, so it's no longer too soon (it may be taken by the walk-in in another test).
        Assert.NotEqual(SlotStatuses.TooSoon, forClient.Slots.Single(s => s.StartTime == new TimeOnly(12, 0)).Status);
        Assert.DoesNotContain(forLeyah.Slots, s => s.Status == SlotStatuses.TooSoon);
    }

    [Fact]
    public async Task A_client_cannot_book_or_move_to_a_time_within_two_hours()
    {
        var user = await _factory.CreateClientAsync();

        var tooSoon = await user.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking((Today, new TimeOnly(11, 30))));
        var later = await user.Client.BookAsync(TestHelpers.NewBooking(_factory.NextSlot()));
        var moveTooSoon = await user.Client.PostJsonAsync($"/api/bookings/{later.Booking.Id}/reschedule", new RescheduleRequest(Today, new TimeOnly(11, 0)));

        await tooSoon.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.Equal("too_soon", (await tooSoon.ReadProblemAsync()).ProblemCode());
        Assert.Equal("too_soon", (await moveTooSoon.ReadProblemAsync()).ProblemCode());
        Assert.False(_factory.WithDb(db => db.Bookings.Any(b => b.ClientId == user.Id && b.BookingDate == Today)));
    }

    [Fact]
    public async Task Leyah_can_add_a_booking_for_a_time_within_two_hours()
    {
        var admin = await _factory.CreateAdminClientAsync();

        var response = await admin.PostJsonAsync("/api/admin/bookings", new AdminCreateBookingRequest(
            1, Today, new TimeOnly(11, 0), GuestName: "Walk In", GuestPhone: "09171112233", NailColor: TestHelpers.Color,
            Paid: "Deposit", PaymentMethod: PaymentMethod.Cash));

        await response.ShouldHaveStatus(HttpStatusCode.Created);
    }
}
