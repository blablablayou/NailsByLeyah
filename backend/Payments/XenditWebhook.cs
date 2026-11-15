using System.Text.Json;

namespace NailsByLeah.Api.Payments;

/// <summary>
/// Reads Xendit's payment session events (docs.xendit.co, "Webhook notification for updates on payment session"):
/// { "event": "payment_session.completed" | "payment_session.expired", "data": { "payment_session_id", "reference_id",
/// "status", "amount", "currency", "payment_id", ... } }.
/// </summary>
public static class XenditWebhook
{
    /// <summary>The report in our terms, or null for an event this site doesn't act on.</summary>
    public static CheckoutStatus? Parse(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
            return null;
        var state = Text(body, "event") switch
        {
            "payment_session.completed" => CheckoutState.Paid,
            "payment_session.expired" => CheckoutState.Expired,
            _ => (CheckoutState?)null,
        };
        return state is null ? null : FromSession(data, state.Value);
    }

    /// <summary>A session object as Xendit returns it (webhook data, or GET /sessions/{id}).</summary>
    public static CheckoutStatus FromSession(JsonElement session, CheckoutState state) => new(
        Text(session, "payment_session_id") ?? "",
        state,
        Text(session, "payment_id"),
        session.TryGetProperty("amount", out var amount) && amount.ValueKind == JsonValueKind.Number ? amount.GetDecimal() : null,
        Text(session, "currency"),
        Text(session, "reference_id"));

    /// <summary>Xendit's session status: ACTIVE, COMPLETED, EXPIRED or CANCELED.</summary>
    public static CheckoutState StateOf(string? status) => status switch
    {
        "COMPLETED" => CheckoutState.Paid,
        "EXPIRED" => CheckoutState.Expired,
        "CANCELED" => CheckoutState.Failed,
        _ => CheckoutState.Open,
    };

    private static string? Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
