using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Services;

public enum ConfirmationOutcome { Confirmed, AlreadyHandled, Ignored, PaidButNeedsRefund }

/// <summary>
/// Turns what Xendit reports (its webhook, or the server asking it) into the booking's state. Only this marks a hosted
/// payment as paid; the browser and the return address never do.
/// </summary>
public interface ICheckoutConfirmationService
{
    /// <summary>The booking a provider report is about: our reference first ("booking-{id}"), else the session id.</summary>
    Task<int?> FindBookingIdAsync(CheckoutStatus status, CancellationToken ct = default);

    Task<ConfirmationOutcome> ApplyAsync(int bookingId, CheckoutStatus status, CancellationToken ct = default);
}

public sealed class CheckoutConfirmationService(
    IBookingRepository bookings,
    IPaymentRepository payments,
    ISlotAvailability slots,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IBackgroundNotifications background,
    ISalonProfileService salonProfile,
    ILogger<CheckoutConfirmationService> logger) : ICheckoutConfirmationService
{
    private const string Currency = "PHP";

    public async Task<int?> FindBookingIdAsync(CheckoutStatus status, CancellationToken ct = default)
    {
        if (HostedCheckoutReference.TryParse(status.Reference, out var id))
            return id;
        return string.IsNullOrEmpty(status.SessionId) ? null : await bookings.FindIdByCheckoutSessionAsync(status.SessionId, ct);
    }

    public async Task<ConfirmationOutcome> ApplyAsync(int bookingId, CheckoutStatus status, CancellationToken ct = default)
    {
        if (status.State != CheckoutState.Paid)
            return ConfirmationOutcome.Ignored; // expired or open: the expiry job releases holds whose time is up

        var found = await bookings.GetDetailsAsync(bookingId, ct);
        if (found is null || found.PaymentIdempotencyKey is null)
            return ConfirmationOutcome.Ignored;
        if (found.AmountPaid > 0)
            return await HandleRepeatAsync(found, status, ct);

        var expected = found.AmountFor(found.PaymentOption);
        if (!string.Equals(status.Currency, Currency, StringComparison.OrdinalIgnoreCase) || status.Amount != expected)
        {
            audit.Record(AuditActions.PaymentFailed, nameof(Booking), bookingId,
                $"Xendit payment amount mismatch: {status.Currency} {status.Amount:0.00} reported, PHP {expected:0.00} expected. Not accepted.");
            await unitOfWork.SaveChangesAsync(ct);
            logger.LogWarning("Xendit payment for booking {BookingId} did not match the expected amount", bookingId);
            await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(found,
                $"A Xendit payment for this booking did not match: {status.Currency} {status.Amount:0.00} reported, PHP {expected:0.00} expected. It was not accepted. Check Xendit, and refund it if money was taken.", stop),
                $"payment mismatch alert for booking {bookingId}");
            return ConfirmationOutcome.Ignored;
        }

        unitOfWork.DiscardChanges(); // read it again under the day lock
        (ConfirmationOutcome Outcome, Booking? Booking, Payment? Payment) result;
        try
        {
            result = await unitOfWork.ExecuteInTransactionAsync<(ConfirmationOutcome, Booking?, Payment?)>(async tx =>
            {
                await bookings.LockDayAsync(found.BookingDate, tx);
                var booking = await bookings.GetDetailsAsync(bookingId, tx);
                if (booking is null)
                    return (ConfirmationOutcome.Ignored, null, null);
                if (booking.AmountPaid > 0)
                    return (ConfirmationOutcome.AlreadyHandled, booking, (Payment?)null);

                if (booking.Status == BookingStatus.AwaitingPayment)
                    return (ConfirmationOutcome.Confirmed, booking, Pay(booking, status, expected));

                // The hold ran out (nobody chose to cancel): reinstated only if its time is still ahead and still free.
                if (booking.Status == BookingStatus.Cancelled && booking.Cancellation?.Reason == SystemCancellationReasons.PaymentNotCompleted
                    && booking.StartsAtLocal > clock.LocalNow && await IsFreeAsync(booking, tx))
                {
                    bookings.RemoveCancellation(booking.Cancellation);
                    booking.Cancellation = null;
                    booking.Status = BookingStatus.AwaitingPayment;
                    audit.Record(AuditActions.BookingHeldForPayment, nameof(Booking), booking.Id,
                        "Paid on Xendit after the hold ran out; the time was still free, so the booking was reinstated");
                    return (ConfirmationOutcome.Confirmed, booking, Pay(booking, status, expected));
                }

                // Cancelled by the client, the time has passed, or someone else has the slot: keep the money on record, owe it back.
                var payment = RecordPayment(booking, status, expected);
                booking.AmountPaid = expected;
                booking.RefundDue = expected;
                booking.UpdatedAt = clock.UtcNow;
                audit.Record(AuditActions.PaymentSucceeded, nameof(Booking), booking.Id,
                    $"Paid on Xendit after the booking was no longer held: PHP {expected:0.00} needs a manual refund");
                return (ConfirmationOutcome.PaidButNeedsRefund, booking, payment);
            }, ct);
        }
        catch (UniqueConstraintViolationException ex) when (ex.IndexName == IndexNames.PaymentsIdempotencyKey)
        {
            return ConfirmationOutcome.AlreadyHandled; // the same payment arrived twice at the same moment
        }

        if (result.Booking is { } done && result.Payment is { } paid)
        {
            if (result.Outcome == ConfirmationOutcome.Confirmed)
                await BookingEmails.QueuePaidAsync(background, salonProfile, done, paid);
            else if (result.Outcome == ConfirmationOutcome.PaidButNeedsRefund)
                await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(done,
                    $"Paid PHP {paid.Amount:0.00} on Xendit after the booking was cancelled or its time had passed. Needs a manual refund.", stop),
                    $"refund-needed alert for booking {done.Id}");
        }
        return result.Outcome;
    }

    /// <summary>
    /// A booking already paid. The same payment reported again changes nothing; a different payment (the client paid on
    /// two pages) is money the salon must give back, so Leyah is told.
    /// </summary>
    private async Task<ConfirmationOutcome> HandleRepeatAsync(Booking booking, CheckoutStatus status, CancellationToken ct)
    {
        var reference = status.PaymentId ?? status.SessionId;
        if (booking.Payments.Any(p => p.ReferenceNumber == reference))
            return ConfirmationOutcome.AlreadyHandled;

        audit.Record(AuditActions.PaymentSucceeded, nameof(Booking), booking.Id,
            $"Second payment {reference} of {status.Currency} {status.Amount:0.00} received on Xendit for an already-paid booking: needs a manual refund");
        await unitOfWork.SaveChangesAsync(ct);
        logger.LogWarning("Second Xendit payment for booking {BookingId}", booking.Id);
        await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(booking,
            $"A second payment of {status.Currency} {status.Amount:0.00} (Xendit {reference}) was received for this already-paid booking. Needs a manual refund.", stop),
            $"second payment alert for booking {booking.Id}");
        return ConfirmationOutcome.PaidButNeedsRefund;
    }

    private async Task<bool> IsFreeAsync(Booking booking, CancellationToken ct)
    {
        try
        {
            await slots.EnsureFreeAsync(booking.BookingDate, booking.StartTime, booking.DurationMinutes, movingBookingId: booking.Id, ct);
            return true;
        }
        catch (ConflictException)
        {
            return false;
        }
    }

    /// <summary>The hold is paid: it becomes a Pending booking waiting for Leyah, exactly like a simulated payment.</summary>
    private Payment Pay(Booking booking, CheckoutStatus status, decimal amount)
    {
        var payment = RecordPayment(booking, status, amount);
        booking.Status = BookingStatus.Pending;
        booking.RecordPayment(booking.PaymentOption, amount);
        booking.UpdatedAt = clock.UtcNow;
        audit.Record(AuditActions.PaymentSucceeded, nameof(Payment), payment.ReferenceNumber,
            $"{payment.Method} PHP {amount:0.00} {(booking.PaymentOption == PaymentOption.Full ? "full payment" : "deposit")} for booking #{booking.Id} (Xendit)");
        return payment;
    }

    private Payment RecordPayment(Booking booking, CheckoutStatus status, decimal amount)
    {
        var now = clock.UtcNow;
        var payment = new Payment
        {
            BookingId = booking.Id,
            ClientId = booking.ClientId,
            Method = booking.PendingPaymentMethod ?? PaymentMethod.GCash,
            Option = booking.PaymentOption,
            Amount = amount,
            TotalAmount = booking.TotalPrice,
            BalanceAfter = Math.Max(0, booking.TotalPrice - amount),
            ReferenceNumber = status.PaymentId ?? status.SessionId,
            IdempotencyKey = booking.PaymentIdempotencyKey!.Value,
            Status = PaymentStatus.Succeeded,
            PaidAt = now,
            CreatedAt = now,
        };
        payments.Add(payment);
        return payment;
    }
}

/// <summary>The emails that go out once a booking is paid, whichever way it was paid.</summary>
public static class BookingEmails
{
    public static async Task QueuePaidAsync(IBackgroundNotifications background, ISalonProfileService salonProfile, Booking booking, Payment payment)
    {
        await background.EnqueueAsync((n, stop) => n.SendBookingConfirmationAsync(booking, payment, stop), $"confirmation for booking {booking.Id}");
        if (await salonProfile.WantsAlertAsync(SalonAlert.NewBooking))
            await background.EnqueueAsync((n, stop) => n.SendSalonNewBookingAsync(booking, payment, stop), $"new booking alert for booking {booking.Id}");
    }
}
