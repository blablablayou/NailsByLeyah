using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;
using NailsByLeah.Api.Configuration;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Notifications;
using NailsByLeah.Api.Validation;

namespace NailsByLeah.Api.Services;

/// <summary>Who is between the password and the code: the account and its security stamp when the password was right.</summary>
public sealed record PendingLogin(int UserId, string SecurityStamp);

/// <summary>
/// Leyah's second step: after her password, a 6-digit code sent to her email (Auth:AdminLoginCode, on by default).
/// The code is a hashed user_tokens row, like the sign-up code. Between the two steps, and for a remembered device,
/// the browser holds an encrypted cookie naming the account and its security stamp, so a password change or "sign out
/// other devices" ends both. Clients never get a code.
/// </summary>
public interface IAdminLoginCodeService
{
    /// <summary>Whether this account must enter a code after its password (and this browser isn't remembered for it).</summary>
    bool IsRequiredFor(User user, string? rememberedCookie);

    /// <summary>Sends a fresh code (earlier ones stop working) and starts the wait before another.</summary>
    Task SendAsync(User user, CancellationToken ct = default);

    /// <summary>"Send a new code", after the wait.</summary>
    Task ResendAsync(PendingLogin pending, CancellationToken ct = default);

    /// <summary>Checks the code; the account comes back to sign in. Wrong, expired or locked codes throw.</summary>
    Task<User> VerifyAsync(PendingLogin pending, string code, CancellationToken ct = default);

    /// <summary>A remembered device signed in with the password alone.</summary>
    Task RecordRememberedLoginAsync(User user, CancellationToken ct = default);

    string PendingCookieFor(User user);
    PendingLogin? ReadPending(string? cookie);
    string RememberedCookieFor(User user);

    TimeSpan CodeLifetime { get; }
    TimeSpan RememberFor { get; }
}

public sealed class AdminLoginCodeService(
    IUserRepository users,
    IUserTokenRepository tokens,
    IUnitOfWork unitOfWork,
    IBackgroundNotifications background,
    IAuditLogger audit,
    ISalonClock clock,
    IDataProtectionProvider dataProtection,
    IOptions<AuthOptions> authOptions,
    ResendCooldown resendCooldown) : IAdminLoginCodeService
{
    private const string InvalidMessage = "That code isn't right. Check the email and try again.";
    private readonly AuthOptions _auth = authOptions.Value;
    private readonly IDataProtector _pending = dataProtection.CreateProtector("NailsByLeah.AdminLogin.Pending");
    private readonly IDataProtector _remembered = dataProtection.CreateProtector("NailsByLeah.AdminLogin.Remembered");

    public TimeSpan CodeLifetime => TimeSpan.FromMinutes(_auth.LoginCodeMinutes);
    public TimeSpan RememberFor => TimeSpan.FromDays(_auth.RememberDeviceDays);

    /// <summary>"l•••@gmail.com": enough for Leyah to know which inbox, not enough to read off the screen.</summary>
    public static string EmailHint(string email)
    {
        var at = email.IndexOf('@');
        return at <= 0 ? "your email" : $"{email[0]}•••{email[at..]}";
    }

    public bool IsRequiredFor(User user, string? rememberedCookie) =>
        _auth.AdminLoginCode && user.Role == UserRole.Administrator && !Matches(Read(_remembered, rememberedCookie), user);

    public async Task SendAsync(User user, CancellationToken ct = default)
    {
        await IssueAsync(user, ct);
        resendCooldown.MarkSent(CooldownKey(user.Id));
    }

    public async Task ResendAsync(PendingLogin pending, CancellationToken ct = default)
    {
        var user = await PendingUserAsync(pending, ct);
        resendCooldown.Start(CooldownKey(user.Id));
        await IssueAsync(user, ct);
    }

    public async Task<User> VerifyAsync(PendingLogin pending, string code, CancellationToken ct = default)
    {
        var user = await PendingUserAsync(pending, ct);
        var token = await tokens.GetLatestUnconsumedAsync(user.Id, UserTokenPurpose.AdminLoginCode, ct)
                    ?? throw new ValidationAppException("code", InvalidMessage, "token_invalid");

        var now = clock.UtcNow;
        if (token.IsExpired(now))
            throw new ValidationAppException("code", "This code has expired. Send a new one.", "token_expired");
        if (token.FailedAttempts >= _auth.MaxVerificationAttempts)
            throw new ValidationAppException("code", "Too many wrong tries. Send a new code.", "token_locked");

        if (!SecureTokens.HashMatches(InputNormalizer.Text(code), token.TokenHash))
        {
            token.FailedAttempts++;
            audit.Record(AuditActions.LoginCodeFailed, nameof(User), user.Id, $"Wrong login code ({token.FailedAttempts} of {_auth.MaxVerificationAttempts})", user.Id);
            await unitOfWork.SaveChangesAsync(ct);
            throw new ValidationAppException("code", InvalidMessage, "token_invalid");
        }

        token.ConsumedAt = now;
        audit.Record(AuditActions.LoginSucceeded, nameof(User), user.Id, "With the code from email", user.Id);
        await unitOfWork.SaveChangesAsync(ct);
        return user;
    }

    public async Task RecordRememberedLoginAsync(User user, CancellationToken ct = default)
    {
        if (!_auth.AdminLoginCode)
            return; // with the code switched off, the password step already recorded the sign-in
        audit.Record(AuditActions.LoginSucceeded, nameof(User), user.Id, "On a remembered device", user.Id);
        await unitOfWork.SaveChangesAsync(ct);
    }

    public string PendingCookieFor(User user) => Protect(_pending, user, clock.UtcNow.Add(CodeLifetime));

    public PendingLogin? ReadPending(string? cookie) =>
        Read(_pending, cookie) is { } read ? new PendingLogin(read.UserId, read.Stamp) : null;

    public string RememberedCookieFor(User user) => Protect(_remembered, user, clock.UtcNow.Add(RememberFor));

    private async Task IssueAsync(User user, CancellationToken ct)
    {
        var now = clock.UtcNow;
        foreach (var old in await tokens.GetUnconsumedAsync(user.Id, UserTokenPurpose.AdminLoginCode, ct))
            old.ConsumedAt = now;
        var code = SecureTokens.NewNumericCode();
        tokens.Add(new UserToken
        {
            UserId = user.Id,
            Purpose = UserTokenPurpose.AdminLoginCode,
            TokenHash = SecureTokens.Hash(code),
            ExpiresAt = now.Add(CodeLifetime),
            CreatedAt = now,
        });
        audit.Record(AuditActions.LoginCodeSent, nameof(User), user.Id, "Password accepted; login code sent to email", user.Id);
        await unitOfWork.SaveChangesAsync(ct);
        await background.EnqueueAsync((n, stop) => n.SendAdminLoginCodeAsync(user, code, _auth.LoginCodeMinutes, stop), "admin login code email");
    }

    /// <summary>The account named by the cookie, as long as its password and sessions haven't changed since.</summary>
    private async Task<User> PendingUserAsync(PendingLogin pending, CancellationToken ct)
    {
        var user = await users.GetByIdAsync(pending.UserId, ct);
        return user is { Role: UserRole.Administrator } && user.SecurityStamp == pending.SecurityStamp
            ? user
            : throw new UnauthorizedAppException("Your sign-in timed out. Please log in again.", "login_pending_expired");
    }

    private static string CooldownKey(int userId) => $"login-code:{userId}";

    private static bool Matches((int UserId, string Stamp)? read, User user) =>
        read is { } r && r.UserId == user.Id && r.Stamp == user.SecurityStamp;

    private static string Protect(IDataProtector protector, User user, DateTime expiresUtc) =>
        protector.Protect(string.Join('|', user.Id.ToString(CultureInfo.InvariantCulture), user.SecurityStamp,
            expiresUtc.Ticks.ToString(CultureInfo.InvariantCulture)));

    private (int UserId, string Stamp)? Read(IDataProtector protector, string? cookie)
    {
        if (string.IsNullOrEmpty(cookie))
            return null;
        try
        {
            var parts = protector.Unprotect(cookie).Split('|');
            if (parts.Length != 3 || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var userId)
                || !long.TryParse(parts[2], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
                || new DateTime(ticks, DateTimeKind.Utc) <= clock.UtcNow)
                return null;
            return (userId, parts[1]);
        }
        catch (CryptographicException)
        {
            return null; // made with other keys, tampered with, or not ours
        }
    }
}
