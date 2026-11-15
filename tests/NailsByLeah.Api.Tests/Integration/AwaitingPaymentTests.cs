using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// A booking held while the client pays on Xendit's page (AwaitingPayment): it keeps the time slot from other clients,
/// but it is not a booking for Leyah until it is paid.
/// </summary>
public sealed class AwaitingPaymentTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    /// <summary>Books normally, then turns the booking into an unpaid hold, as the Xendit flow leaves it.</summary>
    private async Task<(BookingResponse Booking, TestUser User)> HoldAsync()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        factory.WithDb(db =>
        {
            db.Payments.RemoveRange(db.Payments.Where(p => p.BookingId == booked.Booking.Id));
            var b = db.Bookings.Single(x => x.Id == booked.Booking.Id);
            b.Status = BookingStatus.AwaitingPayment;
            b.AmountPaid = 0;
            b.PaymentIdempotencyKey = Guid.NewGuid();
            b.PaymentHoldUntil = factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(15);
            b.CheckoutSessionId = $"ps-{b.Id}";
            b.CheckoutUrl = $"https://checkout.test/{b.Id}";
            b.PendingPaymentMethod = PaymentMethod.GCash;
            return db.SaveChanges();
        });
        return (booked.Booking, user);
    }

    private void TurnIntoHold(int bookingId) => factory.WithDb(db =>
    {
        db.Payments.RemoveRange(db.Payments.Where(p => p.BookingId == bookingId));
        var b = db.Bookings.Single(x => x.Id == bookingId);
        b.Status = BookingStatus.AwaitingPayment;
        b.AmountPaid = 0;
        b.PaymentIdempotencyKey = Guid.NewGuid();
        b.PaymentHoldUntil = factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(15);
        return db.SaveChanges();
    });

    [Fact]
    public async Task A_held_slot_is_not_offered_to_another_client()
    {
        var (hold, _) = await HoldAsync();
        var other = await factory.CreateClientAsync();

        var day = await other.Client.GetAsync<DaySlotsResponse>($"/api/slots?date={hold.BookingDate:yyyy-MM-dd}&serviceId=1");
        Assert.NotEqual("Available", day.Slots.Single(s => s.StartTime == hold.StartTime).Status);

        var response = await other.Client.PostJsonAsync("/api/bookings", TestHelpers.NewBooking((hold.BookingDate, hold.StartTime)));
        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("slot_unavailable", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task A_hold_is_not_a_booking_for_Leyah()
    {
        var admin = await factory.CreateAdminClientAsync();
        var user = await factory.CreateClientAsync();
        var booked = (await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()))).Booking;
        var date = booked.BookingDate;
        var made = ApiFactory.StartDate;

        var dashboardBefore = await admin.GetAsync<DashboardResponse>("/api/admin/dashboard");
        var reportBefore = await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={made:yyyy-MM-dd}");
        var calendarBefore = await admin.GetAsync<List<BookingCalendarDayResponse>>($"/api/admin/bookings/calendar?year={date.Year}&month={date.Month}");
        var clientBefore = await admin.GetAsync<ClientDataResponse>($"/api/admin/clients/{user.Id}");

        TurnIntoHold(booked.Id);
        var client = await admin.GetAsync<ClientDataResponse>($"/api/admin/clients/{user.Id}");
        Assert.Equal(clientBefore.BookingCount - 1, client.BookingCount);

        var dashboard = await admin.GetAsync<DashboardResponse>("/api/admin/dashboard");
        var report = await admin.GetAsync<DailySalesReport>($"/api/admin/reports/daily?date={made:yyyy-MM-dd}");
        var calendar = await admin.GetAsync<List<BookingCalendarDayResponse>>($"/api/admin/bookings/calendar?year={date.Year}&month={date.Month}");

        Assert.Equal(dashboardBefore.PendingBookingCount - 1, dashboard.PendingBookingCount);
        Assert.DoesNotContain(dashboard.UpcomingBookings, b => b.Id == booked.Id);
        Assert.Equal(reportBefore.BookingsMade - 1, report.BookingsMade);
        Assert.Equal(calendarBefore.Single(d => d.Date == date).Count - 1, calendar.SingleOrDefault(d => d.Date == date)?.Count ?? 0);
    }

    [Fact]
    public async Task The_admin_list_shows_holds_only_under_awaiting_payment()
    {
        var (hold, _) = await HoldAsync();
        var admin = await factory.CreateAdminClientAsync();

        var all = await admin.GetAsync<PagedResponse<BookingResponse>>($"/api/admin/bookings?date={hold.BookingDate:yyyy-MM-dd}");
        var awaiting = await admin.GetAsync<PagedResponse<BookingResponse>>("/api/admin/bookings?status=AwaitingPayment");

        Assert.DoesNotContain(all.Items, b => b.Id == hold.Id);
        Assert.Contains(awaiting.Items, b => b.Id == hold.Id);
    }

    [Fact]
    public async Task A_client_sees_their_hold_as_awaiting_payment()
    {
        var (hold, user) = await HoldAsync();

        var history = await user.Client.GetAsync<List<BookingResponse>>("/api/bookings");

        var mine = history.Single(b => b.Id == hold.Id);
        Assert.Equal("AwaitingPayment", mine.Status);
        Assert.Equal($"https://checkout.test/{hold.Id}", mine.CheckoutUrl);
        Assert.NotNull(mine.PaymentHoldUntil);
    }
}
