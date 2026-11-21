using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Services;

/// <summary>Releases holds whose time ran out before the client paid on Xendit's page.</summary>
public interface IPaymentHoldExpiryJob
{
    /// <summary>Returns how many holds were released.</summary>
    Task<int> RunOnceAsync(CancellationToken ct);
}

public sealed class PaymentHoldExpiryJob(
    IBookingRepository bookings,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IHostedCheckout checkout,
    ICheckoutConfirmationService confirmations,
    ILogger<PaymentHoldExpiryJob> logger) : IPaymentHoldExpiryJob
{
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        var released = 0;
        foreach (var expired in await bookings.GetExpiredHoldsAsync(clock.UtcNow, ct))
        {
            // Paid at the last minute but the notification hasn't come (or never will): confirm it instead of releasing.
            if (expired.CheckoutSessionId is { } open && await TryGetStatusAsync(open, ct) is { State: CheckoutState.Paid } paid)
            {
                await confirmations.ApplyAsync(expired.Id, paid, ct);
                unitOfWork.DiscardChanges();
                continue;
            }

            // One at a time under the day lock, so a payment confirmed at the same moment wins cleanly.
            var session = await unitOfWork.ExecuteInTransactionAsync(async tx =>
            {
                await bookings.LockDayAsync(expired.BookingDate, tx);
                var booking = await bookings.GetDetailsAsync(expired.Id, tx);
                if (booking is null || booking.Status != BookingStatus.AwaitingPayment || booking.PaymentHoldUntil > clock.UtcNow)
                    return (string?)null;
                var now = clock.UtcNow;
                booking.ReleaseHold(now);
                bookings.AddCancellation(new Cancellation
                {
                    BookingId = booking.Id,
                    CancelledByUserId = booking.ClientId,
                    Reason = SystemCancellationReasons.PaymentNotCompleted,
                    CancelledAt = now,
                });
                audit.Record(AuditActions.PaymentNotCompleted, nameof(Booking), booking.Id, "Hold released: the time for paying on Xendit ran out");
                released++;
                return booking.CheckoutSessionId ?? "";
            }, ct);
            unitOfWork.DiscardChanges();

            if (!string.IsNullOrEmpty(session))
                await CloseSessionAsync(session, ct);
        }
        return released;
    }

    private async Task<CheckoutStatus?> TryGetStatusAsync(string sessionId, CancellationToken ct)
    {
        try
        {
            return await checkout.GetStatusAsync(sessionId, ct);
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogWarning(ex, "Could not ask Xendit about a payment session before releasing its hold");
            return null;
        }
    }

    /// <summary>Xendit closes its page at the same time on its own; closing it here as well is only a courtesy.</summary>
    private async Task CloseSessionAsync(string sessionId, CancellationToken ct)
    {
        try
        {
            await checkout.ExpireAsync(sessionId, ct);
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogDebug(ex, "Xendit session already closed");
        }
    }
}

/// <summary>
/// Runs <see cref="IPaymentHoldExpiryJob"/>, then <see cref="IPendingAutoConfirmJob"/>, every Payments:HoldCheckIntervalSeconds
/// (0 turns them off, as tests do).
/// </summary>
public sealed class PaymentHoldExpiryWorker(
    IServiceScopeFactory scopes,
    IOptions<PaymentOptions> options,
    ILogger<PaymentHoldExpiryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var seconds = options.Value.HoldCheckIntervalSeconds;
        if (seconds <= 0)
            return;

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(seconds));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var released = await scope.ServiceProvider.GetRequiredService<IPaymentHoldExpiryJob>().RunOnceAsync(stoppingToken);
                if (released > 0)
                    logger.LogInformation("Released {Count} unpaid payment hold(s)", released);
                await scope.ServiceProvider.GetRequiredService<IPendingAutoConfirmJob>().RunOnceAsync(stoppingToken);
            }
            // An exception leaving this loop would stop the whole API, so only a real shutdown may pass through.
            catch (Exception ex) when (ex is not OperationCanceledException || !stoppingToken.IsCancellationRequested)
            {
                logger.LogCritical(ex, "Payment hold expiry run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
