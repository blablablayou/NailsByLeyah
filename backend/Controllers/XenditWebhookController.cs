using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Payments;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

/// <summary>
/// Xendit's notifications about payment sessions and refunds (https://docs.xendit.co/docs/handling-webhooks). Accepted only with the
/// dashboard's verification token in x-callback-token. Answers 200 to every accepted call, duplicates and unknown events
/// included, because Xendit retries anything else up to six times.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/payments/xendit")]
public sealed class XenditWebhookController(
    IOptions<XenditOptions> xendit,
    ICheckoutConfirmationService confirmations,
    IOnlineRefundService refunds,
    ILogger<XenditWebhookController> logger) : ControllerBase
{
    public const string TokenHeader = "x-callback-token";

    [HttpPost("webhook")]
    public async Task<IActionResult> Receive([FromBody] JsonElement body, CancellationToken ct)
    {
        var expected = xendit.Value.CallbackToken;
        if (string.IsNullOrEmpty(expected))
            return NotFound(); // Xendit isn't set up on this site
        if (!TokenMatches(Request.Headers[TokenHeader].ToString(), expected))
            return Unauthorized();

        if (XenditWebhook.ParseRefund(body) is { } refund)
        {
            var applied = await refunds.ApplyAsync(refund, ct);
            logger.LogInformation("Xendit refund {RefundId} {State}: {Outcome}", refund.RefundId, refund.State, applied ? "applied" : "nothing to change");
            return Ok();
        }
        if (XenditWebhook.Parse(body) is not { } status)
            return Ok();
        if (await confirmations.FindBookingIdAsync(status, ct) is not { } bookingId)
        {
            logger.LogWarning("Xendit notification for an unknown booking ({Session})", status.SessionId);
            return Ok();
        }

        var outcome = await confirmations.ApplyAsync(bookingId, status, ct);
        logger.LogInformation("Xendit {State} for booking {BookingId}: {Outcome}", status.State, bookingId, outcome);
        return Ok();
    }

    private static bool TokenMatches(string given, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(expected));
}
