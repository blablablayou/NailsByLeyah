using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Services;

/// <summary>
/// The client pays the rest of a confirmed booking online before the appointment, on the same hosted payment page as
/// the deposit (reference "booking-{id}-balance-…"). Only the provider's report (its notification, or the server
/// asking it) records the payment; the browser coming back never does.
/// </summary>
public interface IBalancePaymentService
{
    /// <summary>Opens the payment page for the balance left; an open page for the same channel is reused.</summary>
    Task<CheckoutResponse> StartAsync(int clientId, int bookingId, BalanceCheckoutRequest request, CancellationToken ct = default);

    /// <summary>For the page the client comes back to: Paid, Waiting (with the page) or NotCompleted.</summary>
    Task<PaymentStatusResponse> GetStatusAsync(int clientId, int bookingId, CancellationToken ct = default);

    /// <summary>A provider report about a balance page.</summary>
    Task<ConfirmationOutcome> ApplyAsync(int bookingId, CheckoutStatus status, CancellationToken ct = default);
}

public sealed class BalancePaymentService(
    IBookingRepository bookings,
    IPaymentRepository payments,
    IHostedCheckout checkout,
    IUnitOfWork unitOfWork,
    IAuditLogger audit,
    ISalonClock clock,
    IBackgroundNotifications background,
    ISalonProfileService salonProfile,
    IOptions<PaymentOptions> paymentOptions,
    IOptions<FrontendOptions> frontendOptions,
    ILogger<BalancePaymentService> logger) : IBalancePaymentService
{
    private const string Currency = "PHP";

    /// <summary>How long a balance page stays open (the provider needs at least 10 minutes).</summary>
    private static readonly TimeSpan PageLifetime = TimeSpan.FromMinutes(30);

    /// <summary>The provider is asked about a page at most this often, so a page checking every few seconds doesn't flood it.</summary>
    private static readonly TimeSpan StatusCheckInterval = TimeSpan.FromSeconds(5);
    private static readonly ConcurrentDictionary<string, DateTime> LastStatusCheck = new(StringComparer.Ordinal);

    /// <summary>
    /// Whether the client may pay the rest online now: the hosted provider is in use, Leyah has confirmed the booking,
    /// something is left, the appointment is still ahead, and it is the account's own booking (not a walk-in).
    /// </summary>
    public static bool CanPayOnline(Booking booking, DateTime localNow, PaymentProvider provider) =>
        provider == PaymentProvider.Xendit && booking.Status == BookingStatus.Confirmed && booking.GuestName is null
        && booking.BalanceDue > 0 && booking.StartsAtLocal > localNow;

    public async Task<CheckoutResponse> StartAsync(int clientId, int bookingId, BalanceCheckoutRequest request, CancellationToken ct = default)
    {
        var booking = await OwnedAsync(clientId, bookingId, ct);
        if (paymentOptions.Value.Provider != PaymentProvider.Xendit)
            throw new ConflictException("Paying the balance online isn't available. Please pay it at the salon.", "online_balance_unavailable");
        if (request.Method is not (PaymentMethod.GCash or PaymentMethod.Maya))
            throw new ValidationAppException("method", "Choose GCash or Maya.");
        if (booking.BalanceDue <= 0)
            throw new ConflictException("Nothing is left to pay on this booking.", "no_balance_due");
        if (booking.Status != BookingStatus.Confirmed)
            throw new ConflictException("You can pay the balance online once Leyah has confirmed your booking.", "invalid_status");
        if (booking.StartsAtLocal <= clock.LocalNow)
            throw new ConflictException("This appointment has already started. Please pay the balance at the salon.", "invalid_status");

        if (booking.CheckoutSessionId is { } previous && await TryGetStatusAsync(previous, ct) is { } earlier
            && HostedCheckoutReference.TryParseBalance(earlier.Reference, out _))
        {
            if (earlier.State == CheckoutState.Paid)
            {
                await ApplyAsync(booking.Id, earlier, ct);
                throw new ConflictException("This balance has already been paid.", "already_paid");
            }
            if (earlier.State == CheckoutState.Open)
            {
                if (booking.PendingPaymentMethod == request.Method && booking.CheckoutUrl is { } open)
                    return new CheckoutResponse(open);
                if (!await TryExpireAsync(previous, ct))
                    throw new ConflictException("Your earlier payment page is still open. Finish paying there, or try again in a few minutes.",
                        "payment_in_progress");
            }
        }

        var now = clock.UtcNow;
        var returnUrl = $"{frontendOptions.Value.BaseUrl.TrimEnd('/')}/bookings/payment?booking={booking.Id}&for=balance";
        CheckoutSession session;
        try
        {
            session = await checkout.CreateAsync(new CheckoutRequest(booking.Id, HostedCheckoutReference.ForBalance(booking.Id, now),
                booking.BalanceDue, request.Method, now.Add(PageLifetime), returnUrl, returnUrl,
                $"Nails by Leyah booking #{booking.Id} balance"), ct);
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogWarning(ex, "Could not start a balance payment page for booking {BookingId}", booking.Id);
            throw new PaymentUnavailableException();
        }

        booking.PendingPaymentMethod = request.Method;
        booking.UpdatedAt = now;
        await unitOfWork.SaveChangesAsync(ct);
        await bookings.SetCheckoutAsync(booking.Id, session.SessionId, session.CheckoutUrl, ct);
        return new CheckoutResponse(session.CheckoutUrl);
    }

    public async Task<PaymentStatusResponse> GetStatusAsync(int clientId, int bookingId, CancellationToken ct = default)
    {
        var booking = await OwnedAsync(clientId, bookingId, ct);
        if (HasPaidBalance(booking))
            return new PaymentStatusResponse("Paid", null, null);
        if (booking.CheckoutSessionId is not { } session)
            return new PaymentStatusResponse("NotCompleted", null, null);
        if (!ShouldAsk(session))
            return new PaymentStatusResponse("Waiting", booking.CheckoutUrl, null);

        var status = await TryGetStatusAsync(session, ct);
        if (status is { State: CheckoutState.Paid } && HostedCheckoutReference.TryParseBalance(status.Reference, out _))
        {
            await ApplyAsync(booking.Id, status, ct);
            unitOfWork.DiscardChanges();
            booking = await OwnedAsync(clientId, bookingId, ct);
            if (HasPaidBalance(booking))
                return new PaymentStatusResponse("Paid", null, null);
        }
        return status is null or { State: CheckoutState.Open }
            ? new PaymentStatusResponse("Waiting", booking.CheckoutUrl, null)
            : new PaymentStatusResponse("NotCompleted", null, null);
    }

    public async Task<ConfirmationOutcome> ApplyAsync(int bookingId, CheckoutStatus status, CancellationToken ct = default)
    {
        if (status.State != CheckoutState.Paid)
            return ConfirmationOutcome.Ignored; // an expired page just ends; nothing was held
        if (await bookings.GetDetailsAsync(bookingId, ct) is not { } booking)
            return ConfirmationOutcome.Ignored;

        var reference = status.PaymentId ?? status.SessionId;
        if (booking.Payments.Any(p => p.ReferenceNumber == reference))
            return ConfirmationOutcome.AlreadyHandled; // the same payment reported again

        var amount = status.Amount ?? 0;
        var due = booking.BalanceDue;
        var accepted = string.Equals(status.Currency, Currency, StringComparison.OrdinalIgnoreCase) && amount > 0 && amount == due
                       && booking.Status is BookingStatus.Pending or BookingStatus.Confirmed or BookingStatus.Completed;
        if (!accepted)
        {
            // Cancelled meanwhile, settled at the salon, or a different amount: the money is real, so Leyah gives it back.
            audit.Record(AuditActions.PaymentSucceeded, nameof(Booking), booking.Id,
                $"Balance payment {reference} of {status.Currency} {amount:0.00} received online but not accepted " +
                $"({booking.Status}, PHP {due:0.00} left to pay): needs a manual refund");
            await unitOfWork.SaveChangesAsync(ct);
            logger.LogWarning("A balance payment for booking {BookingId} could not be accepted", booking.Id);
            await background.EnqueueAsync((n, stop) => n.SendSalonCancellationAsync(booking,
                $"A balance payment of {status.Currency} {amount:0.00} (reference {reference}) arrived for this booking, but it is {booking.Status} with PHP {due:0.00} left to pay, so it was not accepted. Please refund it.", stop),
                $"balance not accepted alert for booking {booking.Id}");
            return ConfirmationOutcome.PaidButNeedsRefund;
        }

        var now = clock.UtcNow;
        var payment = new Payment
        {
            BookingId = booking.Id,
            ClientId = booking.ClientId,
            Method = booking.PendingPaymentMethod ?? PaymentMethod.GCash,
            Option = PaymentOption.Balance,
            Amount = amount,
            TotalAmount = booking.TotalPrice,
            BalanceAfter = 0,
            ReferenceNumber = reference,
            IdempotencyKey = Guid.NewGuid(),
            Status = PaymentStatus.Succeeded,
            VerifiedAt = now, // the provider confirmed it; there is nothing for Leyah to check
            PaidAt = now,
            CreatedAt = now,
        };
        payments.Add(payment);
        booking.AmountPaid += amount;
        booking.UpdatedAt = now;
        audit.Record(AuditActions.PaymentSucceeded, nameof(Payment), reference,
            $"{payment.Method} PHP {amount:0.00} balance for booking #{booking.Id} (paid online)");
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (UniqueConstraintViolationException)
        {
            unitOfWork.DiscardChanges();
            return ConfirmationOutcome.AlreadyHandled; // the same report arrived twice at the same moment
        }

        if (await salonProfile.WantsAlertAsync(SalonAlert.NewBooking))
            await background.EnqueueAsync((n, stop) => n.SendSalonBalancePaidAsync(booking, payment, stop), $"balance paid alert for booking {booking.Id}");
        return ConfirmationOutcome.Confirmed;
    }

    private static bool HasPaidBalance(Booking booking) =>
        booking.Payments.Any(p => p.Option == PaymentOption.Balance && p.Status == PaymentStatus.Succeeded);

    private async Task<Booking> OwnedAsync(int clientId, int bookingId, CancellationToken ct)
    {
        var booking = await bookings.GetDetailsAsync(bookingId, ct);
        return booking is not null && booking.ClientId == clientId ? booking : throw new NotFoundException("Booking not found.");
    }

    private bool ShouldAsk(string sessionId)
    {
        var now = clock.UtcNow;
        if (LastStatusCheck.TryGetValue(sessionId, out var last) && now - last < StatusCheckInterval)
            return false;
        LastStatusCheck[sessionId] = now;
        return true;
    }

    private async Task<CheckoutStatus?> TryGetStatusAsync(string sessionId, CancellationToken ct)
    {
        try
        {
            return await checkout.GetStatusAsync(sessionId, ct);
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogWarning(ex, "Could not ask about a balance payment page");
            return null;
        }
    }

    private async Task<bool> TryExpireAsync(string sessionId, CancellationToken ct)
    {
        try
        {
            await checkout.ExpireAsync(sessionId, ct);
            return true;
        }
        catch (HostedCheckoutException ex)
        {
            logger.LogWarning(ex, "Could not close an earlier balance payment page");
            return false;
        }
    }
}
