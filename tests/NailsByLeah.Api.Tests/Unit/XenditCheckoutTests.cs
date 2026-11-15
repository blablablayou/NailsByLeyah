using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Payments;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>The Xendit Payment Sessions client, against a fake HTTP server.</summary>
public sealed class XenditCheckoutTests
{
    private const string Key = "xnd_development_secret123";

    private sealed class FakeXendit(Func<HttpRequestMessage, string, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            Calls.Add((request, body));
            return answer(request, body);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, string json) =>
        new(code) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static (XenditCheckout Client, FakeXendit Server) Create(Func<HttpRequestMessage, string, HttpResponseMessage> answer)
    {
        var server = new FakeXendit(answer);
        var http = new HttpClient(server) { BaseAddress = new Uri("https://api.xendit.co/") };
        var options = Options.Create(new XenditOptions { SecretKey = Key, CallbackToken = "t" });
        return (new XenditCheckout(http, options, NullLogger<XenditCheckout>.Instance), server);
    }

    private static readonly CheckoutRequest Request = new(42, "booking-42", 150m, PaymentMethod.Maya,
        new DateTime(2026, 11, 2, 0, 15, 0, DateTimeKind.Utc), "https://site.test/bookings/payment?booking=42",
        "https://site.test/bookings/payment?booking=42", "Nails by Leyah booking #42 deposit");

    private const string Created = """
        {"payment_session_id":"ps-0123456789abcdef01234567","payment_link_url":"https://checkout-staging.xendit.co/ps-0123","status":"ACTIVE"}
        """;

    [Fact]
    public async Task Create_sends_amount_currency_channel_reference_expiry_and_return_addresses()
    {
        var (client, server) = Create((_, _) => Json(HttpStatusCode.Created, Created));

        await client.CreateAsync(Request, CancellationToken.None);

        var (request, body) = Assert.Single(server.Calls);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://api.xendit.co/sessions", request.RequestUri!.ToString());
        Assert.Equal("Basic", request.Headers.Authorization!.Scheme);
        Assert.Equal($"{Key}:", Encoding.UTF8.GetString(Convert.FromBase64String(request.Headers.Authorization.Parameter!)));
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        Assert.Equal("booking-42", root.GetProperty("reference_id").GetString());
        Assert.Equal("PAY", root.GetProperty("session_type").GetString());
        Assert.Equal("PAYMENT_LINK", root.GetProperty("mode").GetString());
        Assert.Equal(150m, root.GetProperty("amount").GetDecimal());
        Assert.Equal("PHP", root.GetProperty("currency").GetString());
        Assert.Equal("PH", root.GetProperty("country").GetString());
        Assert.Equal(["PAYMAYA"], root.GetProperty("allowed_payment_channels").EnumerateArray().Select(c => c.GetString()));
        Assert.Equal("2026-11-02T00:15:00Z", root.GetProperty("expires_at").GetString());
        Assert.Equal("https://site.test/bookings/payment?booking=42", root.GetProperty("success_return_url").GetString());
        Assert.Equal("https://site.test/bookings/payment?booking=42", root.GetProperty("cancel_return_url").GetString());
        Assert.Equal("Nails by Leyah booking #42 deposit", root.GetProperty("description").GetString());
    }

    [Fact]
    public async Task GCash_is_offered_as_the_GCASH_channel()
    {
        var (client, server) = Create((_, _) => Json(HttpStatusCode.Created, Created));

        await client.CreateAsync(Request with { Method = PaymentMethod.GCash }, CancellationToken.None);

        using var json = JsonDocument.Parse(server.Calls.Single().Body);
        Assert.Equal(["GCASH"], json.RootElement.GetProperty("allowed_payment_channels").EnumerateArray().Select(c => c.GetString()));
    }

    [Fact]
    public async Task Create_reads_the_session_id_and_checkout_address()
    {
        var (client, _) = Create((_, _) => Json(HttpStatusCode.Created, Created));

        var session = await client.CreateAsync(Request, CancellationToken.None);

        Assert.Equal(new CheckoutSession("ps-0123456789abcdef01234567", "https://checkout-staging.xendit.co/ps-0123"), session);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, """{"error_code":"INVALID_EXPIRY_DATE","message":"bad"}""")]
    [InlineData(HttpStatusCode.Unauthorized, """{"error_code":"INVALID_API_KEY"}""")]
    [InlineData(HttpStatusCode.Created, """{"status":"ACTIVE"}""")]
    [InlineData(HttpStatusCode.Created, "not json")]
    public async Task A_provider_error_becomes_HostedCheckoutException(HttpStatusCode code, string answer)
    {
        var (client, _) = Create((_, _) => Json(code, answer));

        await Assert.ThrowsAsync<HostedCheckoutException>(() => client.CreateAsync(Request, CancellationToken.None));
    }

    [Fact]
    public async Task A_timeout_becomes_HostedCheckoutException()
    {
        var (client, _) = Create((_, _) => throw new TaskCanceledException("timed out"));

        await Assert.ThrowsAsync<HostedCheckoutException>(() => client.CreateAsync(Request, CancellationToken.None));
    }

    [Theory]
    [InlineData("COMPLETED", CheckoutState.Paid)]
    [InlineData("EXPIRED", CheckoutState.Expired)]
    [InlineData("CANCELED", CheckoutState.Failed)]
    [InlineData("ACTIVE", CheckoutState.Open)]
    public async Task Get_status_maps_xendit_statuses(string xenditStatus, CheckoutState expected)
    {
        var (client, server) = Create((_, _) => Json(HttpStatusCode.OK,
            $$"""{"payment_session_id":"ps-1","reference_id":"booking-42","status":"{{xenditStatus}}","amount":150,"currency":"PHP","payment_id":"py-9"}"""));

        var status = await client.GetStatusAsync("ps-1", CancellationToken.None);

        Assert.Equal("https://api.xendit.co/sessions/ps-1", server.Calls.Single().Request.RequestUri!.ToString());
        Assert.Equal(new CheckoutStatus("ps-1", expected, "py-9", 150m, "PHP", "booking-42"), status);
    }

    [Fact]
    public async Task Expire_cancels_the_session()
    {
        var (client, server) = Create((_, _) => Json(HttpStatusCode.OK, """{"status":"CANCELED"}"""));

        await client.ExpireAsync("ps-1", CancellationToken.None);

        var (request, _) = server.Calls.Single();
        Assert.Equal((HttpMethod.Post, "https://api.xendit.co/sessions/ps-1/cancel"), (request.Method, request.RequestUri!.ToString()));
    }

    [Fact]
    public async Task The_secret_key_never_appears_in_exception_messages()
    {
        var (client, _) = Create((_, _) => Json(HttpStatusCode.Unauthorized, $$"""{"message":"bad key {{Key}}"}"""));

        var error = await Assert.ThrowsAsync<HostedCheckoutException>(() => client.CreateAsync(Request, CancellationToken.None));

        Assert.DoesNotContain(Key, error.ToString());
    }
}
