using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Its own site, since the test moves the clock on by half a day.</summary>
public sealed class AutoConfirmApiFactory : ApiFactory;

/// <summary>A booking paid online that Leyah hasn't confirmed is confirmed for her after 12 hours.</summary>
public sealed class AutoConfirmTests(AutoConfirmApiFactory factory) : IClassFixture<AutoConfirmApiFactory>
{
    private async Task<int> RunJobAsync()
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IPendingAutoConfirmJob>().RunOnceAsync(CancellationToken.None);
    }

    private BookingStatus StatusOf(int id) => factory.WithDb(db => db.Bookings.Single(b => b.Id == id).Status);

    [Fact]
    public async Task A_paid_booking_left_pending_for_12_hours_is_confirmed_automatically_and_the_client_is_told()
    {
        var user = await factory.CreateClientAsync();
        var booked = await user.Client.BookAsync(TestHelpers.NewBooking(factory.NextSlot()));
        var id = booked.Booking.Id;
        Assert.Equal(BookingStatus.Pending, StatusOf(id));

        factory.Clock.Advance(TimeSpan.FromHours(11));
        await RunJobAsync();
        Assert.Equal(BookingStatus.Pending, StatusOf(id)); // still Leyah's to confirm

        factory.Clock.Advance(TimeSpan.FromHours(1) + TimeSpan.FromMinutes(1));
        Assert.True(await RunJobAsync() >= 1);
        Assert.Equal(BookingStatus.Confirmed, StatusOf(id));
        Assert.Contains(id, factory.Notifications.ApprovedBookingIds);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.EntityId == id.ToString() && a.Action == "BookingConfirmed" && a.Details!.StartsWith("Confirmed automatically"))));

        Assert.Equal(0, await RunJobAsync()); // nothing left to confirm twice
    }
}
