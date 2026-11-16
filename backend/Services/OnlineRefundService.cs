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
/// A booking can have two online payments (the deposit, then the balance paid before the appointment). The refund owed
/// goes back newest payment first, one part per payment, each part sent as soon as the one before it has arrived; Leyah
/// and the client see one refund.
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

    /// <summary>The payments taken on the provider's page (Xendit payment ids start "py-"), newest first.</summary>
    private static List<Payment> OnlinePayments(Booking booking) => booking.Payments
        .Where(p => p.Status == PaymentStatus.Succeeded && p.ReferenceNumber.StartsWith("py-", StringComparison.Ordinal))
        .OrderByDescending(p => p.PaidAt).ThenByDescending(p => p.Id)
        .ToList();

    /// <summary>The first payment taken on the provider's page, if any.</summary>
    public static Payment? OnlinePaymentOf(Booking booking) => OnlinePayments(booking).LastOrDefault();

    /// <summary>Whether the refund owed can go back online: it was paid online, and the online payments cover it.</summary>
    public static bool CanRefundOnline(Booking booking)
    {
        var online = OnlinePayments(booking);
        return online.Count > 0 && online.Sum(p => p.Amount) >= booking.RefundDue;
    }

    /// <summary>How much of the refund owed has already gone back online.</summary>
    public static decimal RefundedOnline(Booking booking) => booking.Payments.Sum(p => p.RefundedAmount);

    /// <summary>
    /// The next part still to go back: which payment and how much. The refund owed is shared out newest payment first
    /// (so a kept deposit stays on the deposit), and a part is whatever of a payment's share hasn't gone back yet.
    /// </summary>
    public static (Payment Payment, decimal Amount)? NextPart(Booking booking)
    {
        var left = booking.RefundDue;
        foreach (var payment in OnlinePayments(booking))
        {
            if (left <= 0)
                break;
            var share = Math.Min(payment.Amount, left);
            left -= share;
            if (payment.RefundedAmount < share)
                return (payment, share - payment.RefundedAmount);
        }
        return null;
    }

    public async Task<BookingResponse> RefundAsync(int bookingId, CancellationToken ct = default)
    {
        var booking = await LoadAsync(bookingId, ct);
        if (!CanRefundOnline(booking))
            throw new ConflictException("This booking wasn't paid online, so its refund can't go back online. Send it yourself and record it.",
                "online_refund_unavailable");

        booking.StartOnlineRefund(clock.UtcNow);
        await unitOfWork.SaveChangesAsync(ct); // a second click now finds it Processing
        await SendNextPartAsync(booking, ct);
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
            await SettleAsync(booking, await AskAsync(refundId, ct), ct);
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
        var changed = await SettleAsync(booking, outcome, ct);
        if (changed)
        {
            await unitOfWork.SaveChangesAsync(ct);
            await TellClientIfSentAsync(booking);
        }
        return changed;
    }

    /// <summary>Asks the provider to send the next part back. Its answer is applied at once (it may already say Succeeded).</summary>
    private async Task SendNextPartAsync(Booking booking, CancellationToken ct)
    {
        if (NextPart(booking) is not { } part)
            return;
        var now = clock.UtcNow;
        booking.RefundReference = null; // until the provider names this part
        var request = new RefundRequest(part.Payment.ReferenceNumber, HostedCheckoutReference.ForRefund(booking.Id, now), part.Amount,
            booking.Status == BookingStatus.NoShow ? RefundReason.NoShow : RefundReason.Cancellation);
        try
        {
            var outcome = await checkout.RefundAsync(request, ct);
            booking.RefundReference = outcome.RefundId;
            audit.Record(AuditActions.RefundRequested, nameof(Booking), booking.Id,
                $"PHP {part.Amount:0.00} sent back online to the client's {part.Payment.Method} ({outcome.RefundId})");
            await SettleAsync(booking, outcome, ct);
        }
        catch (HostedCheckoutException ex) when (ex.Refused)
        {
            booking.FailOnlineRefund(null, clock.UtcNow);
            audit.Record(AuditActions.RefundFailed, nameof(Booking), booking.Id, $"PHP {part.Amount:0.00} could not be sent back online: {ex.Message}");
            logger.LogWarning("Online refund for booking {BookingId} was refused: {Reason}", booking.Id, ex.Message);
        }
        catch (HostedCheckoutException ex)
        {
            // No clear answer: the refund may exist. It stays Processing; the provider's notification (or a check) settles it.
            audit.Record(AuditActions.RefundRequested, nameof(Booking), booking.Id,
                $"PHP {part.Amount:0.00} sent back online to the client's {part.Payment.Method}; no answer yet ({ex.Message})");
            logger.LogWarning("Online refund for booking {BookingId} got no clear answer: {Reason}", booking.Id, ex.Message);
        }
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

    /// <summary>
    /// Applies what the provider says about the part on its way. Pending changes nothing; a repeat changes nothing. A part
    /// that arrived is counted on its payment, then the next part is sent, or, with none left, the refund is done.
    /// </summary>
    private async Task<bool> SettleAsync(Booking booking, RefundOutcome outcome, CancellationToken ct)
    {
        var now = clock.UtcNow;
        switch (outcome.State)
        {
            case ProviderRefundState.Succeeded when booking.IsAwaitingRefund(outcome.RefundId) && NextPart(booking) is { } part:
                part.Payment.RefundedAmount += part.Amount;
                if (NextPart(booking) is null)
                {
                    booking.CompleteOnlineRefund(outcome.RefundId, now);
                    audit.Record(AuditActions.RefundSent, nameof(Booking), booking.Id,
                        $"PHP {booking.RefundDue:0.00} sent back online ({outcome.RefundId})");
                    _sentNow = true;
                }
                else
                {
                    audit.Record(AuditActions.RefundSent, nameof(Booking), booking.Id,
                        $"PHP {part.Amount:0.00} of PHP {booking.RefundDue:0.00} sent back online ({outcome.RefundId}); sending the rest");
                    await unitOfWork.SaveChangesAsync(CancellationToken.None); // the part that arrived is kept whatever happens next
                    await SendNextPartAsync(booking, ct);
                }
                return true;
            case ProviderRefundState.Failed when booking.FailOnlineRefund(outcome.RefundId, now):
                audit.Record(AuditActions.RefundFailed, nameof(Booking), booking.Id,
                    $"The online refund {outcome.RefundId} didn't go through{(outcome.FailureCode is { } code ? $" ({code})" : "")}");
                return true;
            default:
                return false;
        }
    }

    // A refund only turns Succeeded once, so a repeated notification never sends a second email.
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
