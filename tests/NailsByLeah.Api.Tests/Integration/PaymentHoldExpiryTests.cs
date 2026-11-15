using Microsoft.Extensions.DependencyInjection;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Holds whose 15 minutes ran out without a payment are released, so the slot can be booked again.</summary>
public sealed class PaymentHoldExpiryTests(XenditApiFactory factory) : IClassFixture<XenditApiFactory>
{
    private async Task<int> RunJobAsync()
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IPaymentHoldExpiryJob>().RunOnceAsync(CancellationToken.None);
    }

    private void EndHold(int bookingId) => factory.WithDb(db =>
    {
        db.Bookings.Single(b => b.Id == bookingId).PaymentHoldUntil = factory.Clock.GetUtcNow().UtcDateTime.AddMinutes(-1);
        return db.SaveChanges();
    });

    [Fact]
    public async Task An_expired_hold_is_cancelled_and_its_slot_freed()
    {
        var (id, session, user, request) = await factory.HoldAsync();
        EndHold(id);

        var released = await RunJobAsync();

        Assert.True(released >= 1);
        var booking = factory.WithDb(db => db.Bookings.Where(b => b.Id == id)
            .Select(b => new { b.Status, b.Cancellation!.Reason, b.Cancellation.CancelledByUserId }).Single());
        Assert.Equal((BookingStatus.Cancelled, SystemCancellationReasons.PaymentNotCompleted, user.Id),
            (booking.Status, booking.Reason, booking.CancelledByUserId));
        Assert.DoesNotContain(id, factory.Notifications.SalonCancellationReasons.Keys);
        var other = await factory.CreateClientAsync();
        await other.Client.BookAsync(TestHelpers.NewBooking((request.BookingDate, request.StartTime)));
    }

    [Fact]
    public async Task A_hold_paid_at_Xendit_is_confirmed_not_released()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        factory.Checkout.MarkPaid(session, 150m); // paid, but the notification never arrived
        EndHold(id);

        await RunJobAsync();

        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
        Assert.Single(factory.PaymentsOf(id));
    }

    [Fact]
    public async Task A_hold_still_running_is_left_alone()
    {
        var (id, _, _, _) = await factory.HoldAsync();

        await RunJobAsync();

        Assert.Equal(BookingStatus.AwaitingPayment, factory.Load(id).Status);
    }

    [Fact]
    public async Task A_paid_booking_is_never_expired()
    {
        var (id, session, _, _) = await factory.HoldAsync();
        await factory.PostWebhookAsync(XenditTestKit.PaidEvent(session, id, 150m));
        EndHold(id);

        await RunJobAsync();

        Assert.Equal(BookingStatus.Pending, factory.Load(id).Status);
    }
}
