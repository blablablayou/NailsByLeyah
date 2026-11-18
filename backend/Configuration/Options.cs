namespace NailsByLeah.Api.Configuration;

// Strongly typed settings bound from appsettings.json / environment variables.
// Secrets (SMTP password, admin seed password, production connection string) belong in
// user secrets or environment variables, never in source control (Ref 14.3).

public sealed class AuthOptions
{
    public const string Section = "Auth";
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int SessionIdleTimeoutMinutes { get; set; } = 30;
    public int PasswordResetTokenMinutes { get; set; } = 15;
    public int EmailVerificationCodeHours { get; set; } = 24;
    public int MaxVerificationAttempts { get; set; } = 5;

    /// <summary>How long after a verification code is sent before another can be asked for.</summary>
    public int VerificationResendCooldownSeconds { get; set; } = 60;
    public int BcryptWorkFactor { get; set; } = 12;

    /// <summary>
    /// Leyah enters a code from her email after her password. On by default; set Auth__AdminLoginCode=false on the host to
    /// turn it off without a deploy (for example if email is slow on the day of a demo).
    /// </summary>
    public bool AdminLoginCode { get; set; } = true;
    public int LoginCodeMinutes { get; set; } = 10;

    /// <summary>"Remember this device": how long a browser skips the code after one right code.</summary>
    public int RememberDeviceDays { get; set; } = 30;
}

public sealed class BookingOptions
{
    public const string Section = "Booking";
    public decimal DepositAmount { get; set; } = 150m;
    public int RescheduleMinimumHours { get; set; } = 24;

    /// <summary>Nail colors a client can choose for a new set of nails. Leyah's list goes in appsettings.</summary>
    public string[] NailColors { get; set; } = [];
}

public sealed class ScheduleOptions
{
    public const string Section = "Schedule";
    public string TimeZoneId { get; set; } = "Asia/Manila";
    /// <summary>Official opening time. No appointment may start before it.</summary>
    public TimeOnly OpeningTime { get; set; } = new(11, 0);

    // The closing time is not here: administrators change it in the app (salon_settings table).

    /// <summary>Appointments start on this grid, counted from the opening time (11:00, 11:30, 12:00, ...).</summary>
    public int SlotIntervalMinutes { get; set; } = 30;

    /// <summary>Mandatory gap after every appointment's scheduled end before the next one may begin.</summary>
    public int BufferMinutes { get; set; } = 30;

    /// <summary>
    /// How far ahead of now a client must book (or move a booking), so Leyah can see it, confirm it and get ready.
    /// Bookings Leyah makes herself aren't limited. 0 turns it off.
    /// </summary>
    public int MinimumNoticeMinutes { get; set; } = 120;

    public int MaxDaysAhead { get; set; } = 30;
    public DayOfWeek[] ClosedDays { get; set; } = [];
}

public sealed class UploadOptions
{
    public const string Section = "Uploads";

    /// <summary>
    /// Folder for nail design reference photos. Relative paths are under the app's content root.
    /// It is outside any web root: files are only served through the authorized API endpoint.
    /// </summary>
    public string ReferenceImagePath { get; set; } = "App_Data/reference-images";
}

/// <summary>Emails about serious problems on the website (see Infrastructure/ErrorAlerts.cs). No address means no alerts.</summary>
public sealed class AlertOptions
{
    public const string Section = "Alerts";
    public string? Email { get; set; }
    public int MinutesBetweenEmails { get; set; } = 60;
    public int MaxEmailsPerDay { get; set; } = 3;
}

/// <summary>Supabase Storage for reference photos. The key is a secret: user secrets or host settings only.</summary>
public sealed class SupabaseOptions
{
    public const string Section = "Supabase";
    public string? Url { get; set; }
    public string? SecretKey { get; set; }
    public string ReferenceImageBucket { get; set; } = "reference-images";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Url) && !string.IsNullOrWhiteSpace(SecretKey);
    public string StorageBaseUrl => $"{Url?.TrimEnd('/')}/storage/v1/";
}

public sealed class LegalOptions
{
    public const string Section = "Legal";
    public string TermsVersion { get; set; } = "2.5";
}

public sealed class FrontendOptions
{
    public const string Section = "Frontend";
    public string BaseUrl { get; set; } = "http://localhost:5173";
}

/// <summary>The sender every email shows, whichever delivery channel is used. With Brevo it must be a verified sender.</summary>
public sealed class EmailOptions
{
    public const string Section = "Email";
    public string FromAddress { get; set; } = "no-reply@nailsbyleah.local";
    public string FromName { get; set; } = "Nails by Leyah";
}

/// <summary>Brevo's HTTPS email API. Preferred when hosted, because many hosts block outgoing SMTP ports.</summary>
public sealed class BrevoOptions
{
    public const string Section = "Brevo";
    public string? ApiKey { get; set; }
    public string BaseUrl { get; set; } = "https://api.brevo.com/v3/";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}

public sealed class NotificationOptions
{
    public const string Section = "Notifications";

    /// <summary>How often the reminder job runs. 0 disables it.</summary>
    public int ReminderCheckIntervalMinutes { get; set; } = 15;
    public int ReminderLeadHours { get; set; } = 24;

    /// <summary>Where the salon's own alerts go (new booking, client cancellation, client reschedule). Empty: no alerts.</summary>
    public string? SalonEmail { get; set; }
}

public sealed class DatabaseOptions
{
    public const string Section = "Database";
    public bool ApplyMigrationsOnStartup { get; set; }
}

/// <summary>Payments on a test deployment.</summary>
public sealed class PaymentOptions
{
    public const string Section = "Payments";

    /// <summary>
    /// Lets a test deployment start with the simulated gateway, which approves every payment without money moving.
    /// Off by default, so the live site still refuses to start without a real gateway. Remove it before real clients book.
    /// </summary>
    public bool AllowSimulated { get; set; }

    /// <summary>Who takes payments: Simulated (default, one step) or Xendit (hosted checkout + webhook).</summary>
    public Payments.PaymentProvider Provider { get; set; } = Payments.PaymentProvider.Simulated;

    /// <summary>How long a slot is held while the client pays on Xendit's page.</summary>
    public int HoldMinutes { get; set; } = 15;

    /// <summary>How many times one client may hold at once while paying, so one person can't block the calendar.</summary>
    public int MaxHoldsPerClient { get; set; } = 2;

    /// <summary>How often holds whose time ran out are released (seconds); 0 turns the job off.</summary>
    public int HoldCheckIntervalSeconds { get; set; } = 60;
}

/// <summary>Xendit (test mode). Both values only in user secrets or the host's settings.</summary>
public sealed class XenditOptions
{
    public const string Section = "Xendit";

    /// <summary>The secret API key (test key for the defense).</summary>
    public string? SecretKey { get; set; }

    /// <summary>The webhook verification token from Xendit's dashboard; Xendit sends it in the x-callback-token header.</summary>
    public string? CallbackToken { get; set; }

    public string BaseUrl { get; set; } = "https://api.xendit.co/";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(SecretKey) && !string.IsNullOrWhiteSpace(CallbackToken);
}

/// <summary>Optional first administrator account, created on startup if it does not exist.</summary>
public sealed class AdminSeedOptions
{
    public const string Section = "AdminSeed";
    public string? Username { get; set; }
    public string? Email { get; set; }
    public string? Password { get; set; }
    public string? PhoneNumber { get; set; }
    public string FirstName { get; set; } = "Leyah";
    public string LastName { get; set; } = "Admin";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Email) &&
        !string.IsNullOrWhiteSpace(Password) && !string.IsNullOrWhiteSpace(PhoneNumber);
}

/// <summary>Reading the visitor's real address behind the host's proxy (see Infrastructure/ProxyHeaders.cs).</summary>
public sealed class ProxyOptions
{
    public const string Section = "ForwardedHeaders";

    /// <summary>On only behind a proxy: without one, anyone could fake these headers.</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// How many entries, counted from the right of X-Forwarded-For, to walk back to reach the visitor. On Render
    /// ("visitor, Cloudflare") that is 2. Check it after deploying: too high lets visitors fake their address.
    /// </summary>
    public int ForwardLimit { get; set; } = 2;
}

/// <summary>How many requests one visitor or client may make in a time window (see Infrastructure/RateLimiting.cs).</summary>
public sealed class RateLimitOptions
{
    public const string Section = "RateLimits";

    /// <summary>Off only in automated tests that are not about rate limits.</summary>
    public bool Enabled { get; set; } = true;
    /// <summary>Every API request from one visitor.</summary>
    public RateLimitRule Overall { get; set; } = new(300, 60);
    public RateLimitRule Login { get; set; } = new(10, 5 * 60);
    /// <summary>Sign-up, resend code and forgot password together (each sends an email).</summary>
    public RateLimitRule Email { get; set; } = new(5, 15 * 60);
    /// <summary>Checking an email code or a password reset link.</summary>
    public RateLimitRule Code { get; set; } = new(10, 15 * 60);
    public RateLimitRule Booking { get; set; } = new(10, 10 * 60);
    public RateLimitRule Upload { get; set; } = new(20, 10 * 60);
    public RateLimitRule Feedback { get; set; } = new(5, 10 * 60);
}

/// <summary><see cref="PermitLimit"/> requests per <see cref="WindowSeconds"/> seconds.</summary>
public sealed class RateLimitRule
{
    public RateLimitRule() { }
    public RateLimitRule(int permitLimit, int windowSeconds) => (PermitLimit, WindowSeconds) = (permitLimit, windowSeconds);

    public int PermitLimit { get; set; }
    public int WindowSeconds { get; set; }
}
