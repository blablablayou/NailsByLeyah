using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Services;

/// <summary>
/// Sends a refund back online, to the GCash or Maya account the client paid from, through the payment provider
/// (Xendit's refunds). Only payments taken on the provider's page can go back this way; anything else, or a refund the
/// provider couldn't send, Leyah sends herself and records (<see cref="IAdminBookingService.RecordRefundAsync"/>).
/// </summary>
public interface IOnlineRefundService
{
    /// <summary>Asks the provider to send the refund owed. The booking comes back Processing, Succeeded or Failed.</summary>
    Task<BookingResponse> RefundAsync(int bookingId, CancellationToken ct = default);

    /// <summary>Asks the provider where a Processing refund stands (when its notification is slow to arrive).</summary>
    Task<BookingResponse> CheckAsync(int bookingId, CancellationToken ct = default);

    /// <summary>The provider's notification about a refund. False when it isn't about a refund this site is waiting for.</summary>
    Task<bool> ApplyAsync(RefundOutcome outcome, CancellationToken ct = default);
}

public sealed class OnlineRefundService(
    IBookingRepository bookings,
    IHostedCheckout checkout,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IBackgroundNotifications background,
    ILogger<OnlineRefundService> logger) : IOnlineRefundService
{
    /// <summary>How long a refund the provider never answered about stays Processing before Leyah may send it herself.</summary>
    public static readonly TimeSpan UnansweredAfter = TimeSpan.FromHours(1);

    /// <summary>The payment taken on the provider's page (Xendit payment ids start "py-"), if any.</summary>
    public static Payment? OnlinePaymentOf(Booking booking) => booking.Payments
        .Where(p => p.Status == PaymentStatus.Succeeded && p.ReferenceNumber.StartsWith("py-", StringComparison.Ordinal))
        .OrderBy(p => p.PaidAt)
        .FirstOrDefault();

    public async Task<BookingResponse> RefundAsync(int bookingId, CancellationToken ct = default)
    {
        var booking = await LoadAsync(bookingId, ct);
        var payment = OnlinePaymentOf(booking)
            ?? throw new ConflictException("This booking wasn't paid online, so its refund can't go back online. Send it yourself and record it.",
                "online_refund_unavailable");

        var now = clock.UtcNow;
        var amount = booking.StartOnlineRefund(now);
        await unitOfWork.SaveChangesAsync(ct); // a second click now finds it Processing

        var request = new RefundRequest(payment.ReferenceNumber, HostedCheckoutReference.ForRefund(booking.Id, now), amount,
            booking.Status == BookingStatus.NoShow ? RefundReason.NoShow : RefundReason.Cancellation);
        try
        {
            var outcome = await checkout.RefundAsync(request, ct);
            booking.RefundReference = outcome.RefundId;
            audit.Record(AuditActions.RefundRequested, nameof(Booking), booking.Id,
                $"PHP {amount:0.00} sent back online to the client's {payment.Method} ({outcome.RefundId})");
            Settle(booking, outcome);
        }
        catch (HostedCheckoutException ex) when (ex.Refused)
        {
            booking.FailOnlineRefund(null, clock.UtcNow);
            audit.Record(AuditActions.RefundFailed, nameof(Booking), booking.Id, $"PHP {amount:0.00} could not be sent back online: {ex.Message}");
            logger.LogWarning("Online refund for booking {BookingId} was refused: {Reason}", booking.Id, ex.Message);
        }
        catch (HostedCheckoutException ex)
        {
            // No clear answer: the refund may exist. It stays Processing; the provider's notification (or a check) settles it.
            audit.Record(AuditActions.RefundRequested, nameof(Booking), booking.Id,
                $"PHP {amount:0.00} sent back online to the client's {payment.Method}; no answer yet ({ex.Message})");
            logger.LogWarning("Online refund for booking {BookingId} got no clear answer: {Reason}", booking.Id, ex.Message);
        }
        await unitOfWork.SaveChangesAsync(CancellationToken.None); // whatever happened at the provider is kept
        await TellClientIfSentAsync(booking);
        return BookingMapper.ToResponse(booking, includeClient: true);
    }

    public async Task<BookingResponse> CheckAsync(int bookingId, CancellationToken ct = default)
    {
        var booking = await LoadAsync(bookingId, ct);
        if (booking.RefundStatus != OnlineRefundStatus.Processing)
            return BookingMapper.ToResponse(booking, includeClient: true);

        if (booking.RefundReference is { } refundId)
        {
            Settle(booking, await AskAsync(refundId, ct));
        }
        else if (booking.RefundRequestedAt is { } asked && clock.UtcNow - asked > UnansweredAfter)
        {
            // The provider never answered and never wrote: treat it as not sent, so Leyah isn't stuck.
            booking.FailOnlineRefund(null, clock.UtcNow);
            audit.Record(AuditActions.RefundFailed, nameof(Booking), booking.Id, "No answer about the online refund after an hour");
        }
        await unitOfWork.SaveChangesAsync(ct);
        await TellClientIfSentAsync(booking);
        return BookingMapper.ToResponse(booking, includeClient: true);
    }

    public async Task<bool> ApplyAsync(RefundOutcome outcome, CancellationToken ct = default)
    {
        if (!HostedCheckoutReference.TryParseRefund(outcome.Reference, out var bookingId)
            || await bookings.GetDetailsAsync(bookingId, ct) is not { } booking)
            return false;
        var changed = Settle(booking, outcome);
        if (changed)
        {
            await unitOfWork.SaveChangesAsync(ct);
            await TellClientIfSentAsync(booking);
        }
        return changed;
    }

    private async Task<RefundOutcome> AskAsync(string refundId, CancellationToken ct)
    {
        try
        {
            return await checkout.GetRefundAsync(refundId, ct);
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogWarning("Could not check online refund {RefundId}: {Reason}", refundId, ex.Message);
            throw new RefundCheckUnavailableException();
        }
    }

    /// <summary>Applies what the provider says. Pending changes nothing; a repeat changes nothing.</summary>
    private bool Settle(Booking booking, RefundOutcome outcome)
    {
        var now = clock.UtcNow;
        switch (outcome.State)
        {
            case ProviderRefundState.Succeeded when booking.CompleteOnlineRefund(outcome.RefundId, now):
                audit.Record(AuditActions.RefundSent, nameof(Booking), booking.Id,
                    $"PHP {booking.RefundDue:0.00} sent back online ({outcome.RefundId})");
                _sentNow = true;
                return true;
            case ProviderRefundState.Failed when booking.FailOnlineRefund(outcome.RefundId, now):
                audit.Record(AuditActions.RefundFailed, nameof(Booking), booking.Id,
                    $"The online refund {outcome.RefundId} didn't go through{(outcome.FailureCode is { } code ? $" ({code})" : "")}");
                return true;
            default:
                return false;
        }
    }

    // Settle only turns a booking to Succeeded once, so a repeated notification never sends a second email.
    private bool _sentNow;

    /// <summary>Emails the client once their refund has gone back online, after the change is saved.</summary>
    private async Task TellClientIfSentAsync(Booking booking)
    {
        if (!_sentNow || booking.Client is null || booking.GuestName is not null) // a walk-in sits on Leyah's own account
            return;
        _sentNow = false;
        await background.EnqueueAsync((n, stop) => n.SendRefundSentAsync(booking, stop), $"refund-sent email for booking {booking.Id}");
    }

    private async Task<Booking> LoadAsync(int bookingId, CancellationToken ct) =>
        await bookings.GetDetailsAsync(bookingId, ct) ?? throw new NotFoundException("Booking not found.");
}
