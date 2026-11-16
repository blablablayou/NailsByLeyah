using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Payments;

/// <summary>
/// Xendit Payment Sessions in hosted PAYMENT_LINK mode (https://docs.xendit.co/docs/payment-sessions-overview):
/// POST /sessions creates the page, GET /sessions/{id} reports it, POST /sessions/{id}/cancel closes it
/// (https://docs.xendit.co/apidocs/create-session, get-session, cancel-session). Basic auth: the secret key as the
/// username, no password. Refunds go to POST /v3/refunds and GET /v3/refunds/{id}, which need the api-version header. Every failure becomes <see cref="HostedCheckoutException"/>, never carrying the key.
/// </summary>
public sealed class XenditCheckout(HttpClient http, IOptions<XenditOptions> options, ILogger<XenditCheckout> logger) : IHostedCheckout
{
    public async Task<CheckoutSession> CreateAsync(CheckoutRequest request, CancellationToken ct)
    {
        var body = new
        {
            reference_id = request.Reference,
            session_type = "PAY",
            mode = "PAYMENT_LINK",
            amount = request.Amount,
            currency = "PHP",
            country = "PH",
            // GCash one-time payments are "GCASH"; Maya is "PAYMAYA" (docs.xendit.co/docs/gcash, /docs/maya).
            allowed_payment_channels = new[] { request.Method == PaymentMethod.Maya ? "PAYMAYA" : "GCASH" },
            // At least 10 minutes ahead, or Xendit answers INVALID_EXPIRY_DATE.
            expires_at = request.ExpiresAtUtc.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
            success_return_url = request.SuccessUrl,
            cancel_return_url = request.FailureUrl,
            description = request.Description,
        };
        using var json = await SendAsync(HttpMethod.Post, "sessions", JsonContent.Create(body), ct);
        var id = Text(json.RootElement, "payment_session_id");
        var url = Text(json.RootElement, "payment_link_url");
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(url))
            throw new HostedCheckoutException("Xendit's answer had no payment session id or page address.");
        return new CheckoutSession(id, url);
    }

    public async Task<CheckoutStatus> GetStatusAsync(string sessionId, CancellationToken ct)
    {
        using var json = await SendAsync(HttpMethod.Get, $"sessions/{Uri.EscapeDataString(sessionId)}", null, ct);
        return XenditWebhook.FromSession(json.RootElement, XenditWebhook.StateOf(Text(json.RootElement, "status")));
    }

    public async Task ExpireAsync(string sessionId, CancellationToken ct)
    {
        using var _ = await SendAsync(HttpMethod.Post, $"sessions/{Uri.EscapeDataString(sessionId)}/cancel", null, ct);
    }

    /// <summary>Xendit's refund API version (header api-version), docs.xendit.co/apidocs/create-a-refund.</summary>
    public const string RefundApiVersion = "2024-11-11";

    public async Task<RefundOutcome> RefundAsync(RefundRequest request, CancellationToken ct)
    {
        var body = new
        {
            reference_id = request.Reference,
            payment_id = request.PaymentId,
            amount = request.Amount,
            currency = "PHP",
            reason = request.Reason == RefundReason.NoShow ? "OTHERS" : "CANCELLATION",
        };
        using var json = await SendAsync(HttpMethod.Post, "v3/refunds", JsonContent.Create(body), ct, RefundApiVersion);
        return XenditWebhook.FromRefund(json.RootElement)
               ?? throw new HostedCheckoutException("Xendit's answer had no refund id.");
    }

    public async Task<RefundOutcome> GetRefundAsync(string refundId, CancellationToken ct)
    {
        using var json = await SendAsync(HttpMethod.Get, $"v3/refunds/{Uri.EscapeDataString(refundId)}", null, ct, RefundApiVersion);
        return XenditWebhook.FromRefund(json.RootElement)
               ?? throw new HostedCheckoutException("Xendit's answer had no refund id.");
    }

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, HttpContent? content, CancellationToken ct, string? apiVersion = null)
    {
        using var message = new HttpRequestMessage(method, path) { Content = content };
        if (apiVersion is not null)
            message.Headers.Add("api-version", apiVersion);
        var key = options.Value.SecretKey ?? throw new HostedCheckoutException("Xendit:SecretKey is not set.");
        message.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(key + ":")));

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(message, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new HostedCheckoutException("Xendit could not be reached in time.", ex);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                // Only Xendit's error code is kept: the message could echo what was sent.
                var code = await ErrorCodeAsync(response, ct);
                logger.LogWarning("Xendit answered {Status} {ErrorCode} for {Method} {Path}", (int)response.StatusCode, code, method, path.StartsWith("v3/", StringComparison.Ordinal) ? path.Split('/')[1] : path.Split('/')[0]);
                throw new HostedCheckoutException($"Xendit refused the request ({(int)response.StatusCode} {code}).") { Refused = true };
            }
            try
            {
                return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            }
            catch (JsonException ex)
            {
                throw new HostedCheckoutException("Xendit's answer could not be read.", ex);
            }
        }
    }

    private static async Task<string> ErrorCodeAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var code = Text(json.RootElement, "error_code");
            return code is not null && code.All(c => char.IsAsciiLetterUpper(c) || c == '_') ? code : "UNKNOWN";
        }
        catch (JsonException)
        {
            return "UNKNOWN";
        }
    }

    private static string? Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
