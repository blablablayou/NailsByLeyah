using System.Globalization;
using System.Security.Cryptography;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Payments;

/// <summary>What the provider's hosted page should collect for a held booking.</summary>
public sealed record CheckoutRequest(
    int BookingId, string Reference, decimal Amount, PaymentMethod Method, DateTime ExpiresAtUtc,
    string SuccessUrl, string FailureUrl, string Description);

/// <summary>The provider's session: its id, and the page the client is sent to.</summary>
public sealed record CheckoutSession(string SessionId, string CheckoutUrl);

public enum CheckoutState { Open, Paid, Expired, Failed }

/// <summary>Where a session stands, as the provider reports it (webhook or status check).</summary>
public sealed record CheckoutStatus(string SessionId, CheckoutState State, string? PaymentId, decimal? Amount, string? Currency,
    string? Reference = null);

/// <summary>The provider refused, timed out or answered something unreadable. The message never holds a key.</summary>
/// <summary>Money sent back for a payment taken on the provider's page: all of it, or part (the deposit is kept).</summary>
public sealed record RefundRequest(string PaymentId, string Reference, decimal Amount, RefundReason Reason);

public enum RefundReason { Cancellation, NoShow }

public enum ProviderRefundState { Pending, Succeeded, Failed }

/// <summary>Where a refund stands, as the provider reports it (its answer, its webhook, or a status check).</summary>
public sealed record RefundOutcome(string RefundId, ProviderRefundState State, string? Reference = null, string? FailureCode = null);

public sealed class HostedCheckoutException(string message, Exception? inner = null) : Exception(message, inner)
{
    /// <summary>The provider answered and said no (nothing was done). False when it couldn't be reached or its answer was unreadable.</summary>
    public bool Refused { get; init; }
}

/// <summary>
/// A hosted checkout (Xendit Payment Sessions): the client pays on the provider's page and the provider tells the
/// server afterwards. Used when Payments:Provider is Xendit; the simulated provider keeps <see cref="IPaymentGateway"/>.
/// </summary>
public interface IHostedCheckout
{
    Task<CheckoutSession> CreateAsync(CheckoutRequest request, CancellationToken ct);
    Task<CheckoutStatus> GetStatusAsync(string sessionId, CancellationToken ct);
    Task ExpireAsync(string sessionId, CancellationToken ct);

    /// <summary>Sends money back to the account the client paid from. A refusal throws <see cref="HostedCheckoutException"/>.</summary>
    Task<RefundOutcome> RefundAsync(RefundRequest request, CancellationToken ct);

    Task<RefundOutcome> GetRefundAsync(string refundId, CancellationToken ct);
}

/// <summary>Our reference on the provider's side: "booking-{id}", so any session made for a booking finds it.</summary>
public static class HostedCheckoutReference
{
    private const string Prefix = "booking-";

    public static string For(int bookingId) => Prefix + bookingId.ToString(CultureInfo.InvariantCulture);

    public static bool TryParse(string? reference, out int bookingId)
    {
        bookingId = 0;
        return reference is not null && reference.StartsWith(Prefix, StringComparison.Ordinal)
               && int.TryParse(reference.AsSpan(Prefix.Length), NumberStyles.None, CultureInfo.InvariantCulture, out bookingId)
               && bookingId > 0;
    }

    /// <summary>
    /// "booking-{id}-refund-{time}-{random}": a new one for every try, as the provider wants a fresh reference per refund,
    /// even when Leyah tries again within the same second.
    /// </summary>
    public static string ForRefund(int bookingId, DateTime utcNow) =>
        string.Create(CultureInfo.InvariantCulture, $"{For(bookingId)}-refund-{utcNow:yyyyMMddHHmmss}-{RandomNumberGenerator.GetHexString(6, lowercase: true)}");

    public static bool TryParseRefund(string? reference, out int bookingId)
    {
        bookingId = 0;
        var cut = reference?.IndexOf("-refund-", StringComparison.Ordinal) ?? -1;
        return cut > 0 && TryParse(reference![..cut], out bookingId);
    }
}

/// <summary>Registered while Xendit isn't configured: any attempt to use it fails like an unavailable provider.</summary>
public sealed class UnconfiguredHostedCheckout : IHostedCheckout
{
    private static HostedCheckoutException NotSet() => new("Xendit is not configured (Xendit:SecretKey).") { Refused = true };
    public Task<CheckoutSession> CreateAsync(CheckoutRequest request, CancellationToken ct) => throw NotSet();
    public Task<CheckoutStatus> GetStatusAsync(string sessionId, CancellationToken ct) => throw NotSet();
    public Task ExpireAsync(string sessionId, CancellationToken ct) => throw NotSet();
    public Task<RefundOutcome> RefundAsync(RefundRequest request, CancellationToken ct) => throw NotSet();
    public Task<RefundOutcome> GetRefundAsync(string refundId, CancellationToken ct) => throw NotSet();
}
