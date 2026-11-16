using System.Collections.Concurrent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Payments;
using Npgsql;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Hosts the real API against a throwaway schema in the Postgres test database (the Supabase test project, from the
/// API's user secrets: ConnectionStrings:Tests, or else ConnectionStrings:Default). Time, outgoing messages and the
/// payment provider are replaced with test doubles the tests can control and inspect.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string AdminUsername = "test.admin";
    public const string AdminPassword = "AdminPass123";
    public const string DefaultPassword = "ClientPass123";

    /// <summary>2026-11-02 08:00 in Manila.</summary>
    public static readonly DateTimeOffset StartTime = new(2026, 11, 2, 0, 0, 0, TimeSpan.Zero);
    public static readonly DateOnly StartDate = new(2026, 11, 2);
    /// <summary>Two hours apart: room for the longest seeded service (90 minutes) plus the 30-minute break.</summary>
    // Far enough apart for the longest seeded service (With Design or BIAB, 3 hours) plus the 30-minute break.
    public static readonly TimeOnly[] SlotTimes = [new(11, 0), new(14, 30), new(18, 0)];

    /// <summary>This host's own schema: created before it starts, dropped with everything in it when it stops.</summary>
    private readonly string _schema = $"test_{Guid.NewGuid():N}";
    private readonly string _connectionString = TestConnectionString();

    /// <summary>Throwaway folder for uploaded reference photos.</summary>
    public string UploadFolder { get; } = Path.Combine(Path.GetTempPath(), $"nbl-test-uploads-{Guid.NewGuid():N}");
    private int _userCounter;
    private int _slotCounter;

    public FakeTimeProvider Clock { get; } = new(StartTime);
    public CapturingNotificationService Notifications { get; } = new();
    public TestPaymentGateway Gateway { get; } = new();
    public TestHostedCheckout Checkout { get; } = new();

    /// <summary>Extra settings for a host that tests another configuration (for example Xendit payments).</summary>
    protected virtual void ConfigureSettings(IWebHostBuilder builder) { }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", _connectionString);
        builder.UseSetting("Database:Schema", _schema);
        builder.UseSetting("Database:ApplyMigrationsOnStartup", "true");
        builder.UseSetting("Auth:BcryptWorkFactor", "4");
        builder.UseSetting("Notifications:ReminderCheckIntervalMinutes", "0");
        builder.UseSetting("Payments:HoldCheckIntervalSeconds", "0"); // tests run the expiry job themselves
        builder.UseSetting("AdminSeed:Username", AdminUsername);
        builder.UseSetting("AdminSeed:Email", "admin@test.local");
        builder.UseSetting("AdminSeed:Password", AdminPassword);
        builder.UseSetting("AdminSeed:PhoneNumber", "09990000000");
        builder.UseSetting("Uploads:ReferenceImagePath", UploadFolder);
        // User secrets load in tests too: without this, tests would write to the developer's real bucket.
        builder.UseSetting("Supabase:Url", "");
        builder.UseSetting("Supabase:SecretKey", "");
        // The same for alerts: test errors must not send real emails.
        builder.UseSetting("Alerts:Email", "");
        // Many tests share one test client address; RateLimitTests turns the limits back on with small numbers.
        builder.UseSetting("RateLimits:Enabled", "false");
        // Tests sign Leyah in with her password alone; AdminLoginCodeTests switches her email code back on.
        builder.UseSetting("Auth:AdminLoginCode", "false");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<INotificationService>();
            services.AddSingleton<INotificationService>(Notifications);
            // Emails queued to send after the answer are sent straight away, so tests can read them right after a request.
            services.RemoveAll<IBackgroundNotifications>();
            services.AddSingleton<IBackgroundNotifications>(new InlineBackgroundNotifications(Notifications));
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(Gateway);
            services.RemoveAll<IHostedCheckout>();
            services.AddSingleton<IHostedCheckout>(Checkout);
        });
        ConfigureSettings(builder);
    }

    public HttpClient NewClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        HandleCookies = true,
        AllowAutoRedirect = false,
    });

    public int NextUserNumber() => Interlocked.Increment(ref _userCounter);

    /// <summary>A future slot no other test in this factory has used (day 2 onwards, so always more than 24 hours away).</summary>
    public (DateOnly Date, TimeOnly Time) NextSlot()
    {
        var index = Interlocked.Increment(ref _slotCounter) - 1;
        return (StartDate.AddDays(2 + index / SlotTimes.Length), SlotTimes[index % SlotTimes.Length]);
    }

    public T WithDb<T>(Func<AppDbContext, T> query)
    {
        using var scope = Services.CreateScope();
        return query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task InitializeAsync()
    {
        await RunAsync($"CREATE SCHEMA {_schema}");
        _ = Server; // starts the host: applies migrations and seeds the administrator
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await RunAsync($"DROP SCHEMA IF EXISTS {_schema} CASCADE");
        if (Directory.Exists(UploadFolder))
            Directory.Delete(UploadFolder, recursive: true);
    }

    private async Task RunAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// The test database, from the API's user secrets or the environment. The pool is small and shared by every test host,
    /// because Supabase's session pooler allows only a few connections at once.
    /// </summary>
    private static string TestConnectionString()
    {
        var config = new ConfigurationBuilder()
            .AddUserSecrets(typeof(Program).Assembly, optional: true)
            .AddEnvironmentVariables()
            .Build();
        var value = config.GetConnectionString("Tests") ?? config.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "No test database: set ConnectionStrings:Tests (or ConnectionStrings:Default) in the API's user secrets.");
        return new NpgsqlConnectionStringBuilder(PostgresConnectionString.Normalize(value)) { MaxPoolSize = 8, Timeout = 60, CommandTimeout = 60 }.ConnectionString;
    }
}

/// <summary>Sends queued emails immediately and, like the real queue, swallows a failure instead of failing the request.</summary>
public sealed class InlineBackgroundNotifications(INotificationService notifications) : IBackgroundNotifications
{
    public async ValueTask EnqueueAsync(Func<INotificationService, CancellationToken, Task> send, string description)
    {
        try
        {
            await send(notifications, CancellationToken.None);
        }
        catch (InvalidOperationException)
        {
            // The real queue logs this; the request has already been answered normally.
        }
    }
}

public sealed class CapturingNotificationService : INotificationService
{
    private int _failNext;

    /// <summary>The next verification or password reset email throws, like Brevo being down.</summary>
    public void FailNextEmail() => Interlocked.Exchange(ref _failNext, 1);

    private int _timeOutNextReminder;

    /// <summary>The next reminder times out the way HttpClient does when Brevo takes too long.</summary>
    public void TimeOutNextReminder() => Interlocked.Exchange(ref _timeOutNextReminder, 1);

    private void ThrowIfFailing()
    {
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            throw new InvalidOperationException("Brevo returned 503.");
    }

    private readonly ConcurrentDictionary<string, string> _verificationCodes = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _resetLinks = new(StringComparer.OrdinalIgnoreCase);

    public ConcurrentBag<int> ConfirmedBookingIds { get; } = [];
    public ConcurrentBag<int> RemindedBookingIds { get; } = [];
    public ConcurrentBag<int> ApprovedBookingIds { get; } = [];

    public string VerificationCodeFor(string email) => _verificationCodes[email];

    public string ResetLinkFor(string email) => _resetLinks[email];

    public string ResetTokenFor(string email)
    {
        var link = _resetLinks[email];
        return Uri.UnescapeDataString(link[(link.IndexOf("token=", StringComparison.Ordinal) + "token=".Length)..]);
    }

    private readonly ConcurrentDictionary<string, string> _loginCodes = new(StringComparer.Ordinal);
    private int _loginCodesSent;

    /// <summary>How many sign-in codes have been sent, and the latest one for an address.</summary>
    public int LoginCodesSent => Volatile.Read(ref _loginCodesSent);
    public string LoginCodeFor(string email) => _loginCodes[email];

    public Task SendAdminLoginCodeAsync(User user, string code, int validMinutes, CancellationToken ct = default)
    {
        _loginCodes[user.Email] = code;
        Interlocked.Increment(ref _loginCodesSent);
        return Task.CompletedTask;
    }

    public Task SendEmailVerificationAsync(User user, string code, CancellationToken ct = default)
    {
        ThrowIfFailing();
        _verificationCodes[user.Email] = code;
        return Task.CompletedTask;
    }

    public Task SendPasswordResetAsync(User user, string resetLink, CancellationToken ct = default)
    {
        ThrowIfFailing();
        _resetLinks[user.Email] = resetLink;
        return Task.CompletedTask;
    }

    public Task SendBookingConfirmationAsync(Booking booking, Payment payment, CancellationToken ct = default)
    {
        ThrowIfFailing();
        ConfirmedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendBookingApprovedAsync(Booking booking, CancellationToken ct = default)
    {
        ApprovedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendAppointmentReminderAsync(Booking booking, CancellationToken ct = default)
    {
        if (Interlocked.Exchange(ref _timeOutNextReminder, 0) == 1)
            throw new TaskCanceledException("The request was canceled due to the configured HttpClient.Timeout of 20 seconds elapsing.");
        RemindedBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public ConcurrentBag<int> SalonNewBookingIds { get; } = [];
    public ConcurrentDictionary<int, string> SalonCancellationReasons { get; } = new();
    public ConcurrentDictionary<int, (DateOnly Date, TimeOnly Time)> SalonReschedules { get; } = new();

    public Task SendSalonNewBookingAsync(Booking booking, Payment payment, CancellationToken ct = default)
    {
        SalonNewBookingIds.Add(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendSalonCancellationAsync(Booking booking, string reasonLabel, CancellationToken ct = default)
    {
        SalonCancellationReasons[booking.Id] = reasonLabel;
        return Task.CompletedTask;
    }

    public Task SendSalonRescheduleAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default)
    {
        SalonReschedules[booking.Id] = (fromDate, fromTime);
        return Task.CompletedTask;
    }

    // To the client, about what the salon did.
    public ConcurrentDictionary<int, string> ClientCancellations { get; } = new();
    public ConcurrentDictionary<int, (DateOnly Date, TimeOnly Time)> ClientMoves { get; } = new();
    public ConcurrentQueue<int> RefundSentIds { get; } = new();
    public ConcurrentQueue<int> BalancePaidIds { get; } = new();

    public Task SendSalonBalancePaidAsync(Booking booking, Payment payment, CancellationToken ct = default)
    {
        BalancePaidIds.Enqueue(booking.Id);
        return Task.CompletedTask;
    }

    public Task SendBookingCancelledBySalonAsync(Booking booking, string reasonLabel, string? explanation, CancellationToken ct = default)
    {
        ClientCancellations[booking.Id] = reasonLabel;
        return Task.CompletedTask;
    }

    public Task SendBookingMovedBySalonAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default)
    {
        ClientMoves[booking.Id] = (fromDate, fromTime);
        return Task.CompletedTask;
    }

    public Task SendRefundSentAsync(Booking booking, CancellationToken ct = default)
    {
        RefundSentIds.Enqueue(booking.Id);
        return Task.CompletedTask;
    }
}

/// <summary>Approves charges like the simulated gateway, but counts them and can be told to fail.</summary>
public sealed class TestPaymentGateway : IPaymentGateway
{
    private int _referenceCounter;
    private int _failNext;

    public ConcurrentDictionary<Guid, int> ChargesByKey { get; } = new();

    /// <summary>The amount asked for with each payment key, to check the server charged the right amount.</summary>
    public ConcurrentDictionary<Guid, decimal> AmountsByKey { get; } = new();

    public void FailNextCharge() => Interlocked.Exchange(ref _failNext, 1);

    public int ChargeCount(Guid key) => ChargesByKey.TryGetValue(key, out var count) ? count : 0;

    public Task<PaymentChargeResult> ChargeAsync(PaymentCharge charge, CancellationToken ct = default)
    {
        ChargesByKey.AddOrUpdate(charge.IdempotencyKey, 1, (_, count) => count + 1);
        AmountsByKey[charge.IdempotencyKey] = charge.Amount;
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            return Task.FromResult(PaymentChargeResult.Failure("The e-wallet declined the payment."));

        var reference = $"TEST-{Interlocked.Increment(ref _referenceCounter):D6}-{Guid.NewGuid():N}"[..24];
        return Task.FromResult(PaymentChargeResult.Success(reference));
    }
}

/// <summary>A host whose clients pay on (fake) Xendit pages: bookings are held until the payment is confirmed.</summary>
public sealed class XenditApiFactory : ApiFactory
{
    public const string CallbackToken = "test-callback-token";

    protected override void ConfigureSettings(IWebHostBuilder builder)
    {
        builder.UseSetting("Payments:Provider", "Xendit");
        builder.UseSetting("Xendit:SecretKey", "xnd_development_test");
        builder.UseSetting("Xendit:CallbackToken", CallbackToken);
        builder.UseSetting("Frontend:BaseUrl", "https://site.test");
    }
}

/// <summary>Stands in for Xendit's Payment Sessions: records every session and lets tests decide what Xendit answers.</summary>
public sealed class TestHostedCheckout : IHostedCheckout
{
    private int _counter;
    private int _failNext;

    public ConcurrentQueue<CheckoutRequest> Requests { get; } = new();
    public ConcurrentDictionary<string, CheckoutStatus> Statuses { get; } = new();
    public ConcurrentQueue<string> Expired { get; } = new();
    public CheckoutRequest? LastRequest => Requests.LastOrDefault();

    public void FailNext() => Interlocked.Exchange(ref _failNext, 1);

    private int _failNextExpire;

    /// <summary>The next cancel fails, as Xendit's does while a payment on that page is still processing.</summary>
    public void FailNextExpire() => Interlocked.Exchange(ref _failNextExpire, 1);

    public int CreatedFor(int bookingId) => Requests.Count(r => r.BookingId == bookingId);

    /// <summary>What Xendit would answer for a session after the client paid it.</summary>
    public void MarkPaid(string sessionId, decimal amount, string? paymentId = null) =>
        Statuses[sessionId] = new CheckoutStatus(sessionId, CheckoutState.Paid, paymentId ?? $"py-{sessionId}", amount, "PHP"); // Xendit payment ids are unique

    public Task<CheckoutSession> CreateAsync(CheckoutRequest request, CancellationToken ct)
    {
        Requests.Enqueue(request);
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            throw new HostedCheckoutException("Xendit is unavailable (test).");
        var id = $"ps-test-{Interlocked.Increment(ref _counter)}-{Guid.NewGuid():N}"[..24];
        Statuses[id] = new CheckoutStatus(id, CheckoutState.Open, null, null, null);
        return Task.FromResult(new CheckoutSession(id, $"https://checkout.test/{id}"));
    }

    public Task<CheckoutStatus> GetStatusAsync(string sessionId, CancellationToken ct) =>
        Task.FromResult(Statuses.TryGetValue(sessionId, out var status)
            ? status
            : throw new HostedCheckoutException("Unknown session (test)."));

    public Task ExpireAsync(string sessionId, CancellationToken ct)
    {
        if (Interlocked.Exchange(ref _failNextExpire, 0) == 1)
            throw new HostedCheckoutException("INVALID_SESSION_STATUS (test)");
        Expired.Enqueue(sessionId);
        Statuses[sessionId] = new CheckoutStatus(sessionId, CheckoutState.Expired, null, null, null);
        return Task.CompletedTask;
    }

    // ---- Refunds ----

    private int _refundCounter;
    private int _refuseNextRefund;
    private int _noAnswerNextRefund;

    public ConcurrentQueue<RefundRequest> RefundRequests { get; } = new();
    public ConcurrentDictionary<string, RefundOutcome> Refunds { get; } = new();

    /// <summary>What Xendit answers a new refund with: Pending (wait for its notification) unless a test says otherwise.</summary>
    public ProviderRefundState NextRefundState { get; set; } = ProviderRefundState.Pending;

    /// <summary>The next refund is refused (Xendit answered no, e.g. INSUFFICIENT_BALANCE).</summary>
    public void RefuseNextRefund() => Interlocked.Exchange(ref _refuseNextRefund, 1);

    /// <summary>The next refund gets no clear answer (a timeout): it may or may not exist at Xendit.</summary>
    public void NoAnswerNextRefund() => Interlocked.Exchange(ref _noAnswerNextRefund, 1);

    public Task<RefundOutcome> RefundAsync(RefundRequest request, CancellationToken ct)
    {
        RefundRequests.Enqueue(request);
        if (Interlocked.Exchange(ref _refuseNextRefund, 0) == 1)
            throw new HostedCheckoutException("Xendit refused the request (400 INSUFFICIENT_BALANCE).") { Refused = true };
        if (Interlocked.Exchange(ref _noAnswerNextRefund, 0) == 1)
            throw new HostedCheckoutException("Xendit could not be reached in time.");
        var outcome = new RefundOutcome($"rfd-test-{Interlocked.Increment(ref _refundCounter)}", NextRefundState, request.Reference);
        Refunds[outcome.RefundId] = outcome;
        return Task.FromResult(outcome);
    }

    public Task<RefundOutcome> GetRefundAsync(string refundId, CancellationToken ct) =>
        Task.FromResult(Refunds.TryGetValue(refundId, out var outcome) ? outcome : throw new HostedCheckoutException("Unknown refund (test)."));
}
