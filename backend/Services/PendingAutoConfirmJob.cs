using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;

namespace NailsByLeah.Api.Services;

/// <summary>
/// A booking the client has already paid for online waits for Leyah to confirm it. If she hasn't within
/// Payments:AutoConfirmAfterHours of the payment, or by Payments:AutoConfirmBeforeStartMinutes before the appointment,
/// it is confirmed for her, so a paid client is never left without a confirmation or a reminder. She can still cancel it.
/// </summary>
public interface IPendingAutoConfirmJob
{
    /// <summary>Returns how many bookings were confirmed.</summary>
    Task<int> RunOnceAsync(CancellationToken ct);
}

public sealed class PendingAutoConfirmJob(
    IBookingRepository bookings,
    IPaymentService paymentService,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IBackgroundNotifications background,
    IOptions<PaymentOptions> options,
    ILogger<PendingAutoConfirmJob> logger) : IPendingAutoConfirmJob
{
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        var settings = options.Value;
        if (settings.AutoConfirmAfterHours <= 0)
            return 0;

        var confirmed = 0;
        foreach (var booking in await bookings.GetPendingAsync(ct))
        {
            var now = clock.UtcNow;
            var localNow = clock.LocalNow;
            if (booking.StartsAtLocal <= localNow)
                continue; // the time has passed: Leyah decides what happened
            var payment = await paymentService.GetDepositAsync(booking.Id, ct);
            if (payment is null)
                continue; // nothing paid online, so nothing to confirm on her behalf

            var waitedLong = payment.PaidAt.AddHours(settings.AutoConfirmAfterHours) <= now;
            var startsSoon = booking.StartsAtLocal.AddMinutes(-settings.AutoConfirmBeforeStartMinutes) <= localNow;
            if (!waitedLong && !startsSoon)
                continue;

            try
            {
                booking.ConfirmAutomatically(now);
                payment.VerifiedAt = now; // the payment provider already confirmed the money
                audit.Record(AuditActions.BookingConfirmed, nameof(Booking), booking.Id,
                    waitedLong
                        ? $"Confirmed automatically: paid online and not confirmed within {settings.AutoConfirmAfterHours} hours"
                        : $"Confirmed automatically: paid online and the appointment starts within {settings.AutoConfirmBeforeStartMinutes} minutes");
                await unitOfWork.SaveChangesAsync(ct);
            }
            catch (Exception ex) when (ex is ConflictException or DbUpdateConcurrencyException)
            {
                unitOfWork.DiscardChanges(); // Leyah confirmed or canceled it at the same moment
                continue;
            }

            confirmed++;
            var id = booking.Id;
            var current = await bookings.GetDetailsAsync(id, ct);
            if (current is not null && current.GuestName is null)
                await background.EnqueueAsync((n, stop) => n.SendBookingApprovedAsync(current, stop), $"auto-confirmed email for booking {id}");
        }
        if (confirmed > 0)
            logger.LogInformation("Confirmed {Count} paid booking(s) automatically", confirmed);
        return confirmed;
    }
}
