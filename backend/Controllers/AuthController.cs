using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;
using NailsByLeah.Api.Errors;
using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Services;

namespace NailsByLeah.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IRegistrationService registration,
    IAuthService auth,
    IPasswordResetService passwordReset,
    IAccountSecurityService security,
    IClientProfileService clientProfile,
    IAdminLoginCodeService loginCodes,
    IUserRepository users,
    IDataDeletionRequestService deletionRequests) : ControllerBase
{
    /// <summary>Between Leyah's password and her email code (encrypted, short-lived).</summary>
    private const string PendingCookie = "nbl_login_pending";

    /// <summary>"Remember this device": this browser skips the code for a while (encrypted).</summary>
    private const string RememberedCookie = "nbl_login_device";

    private const string ResetRequestedMessage = "If that email address is registered, a password reset link has been sent. It expires in 15 minutes.";

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("register")]
    public async Task<ActionResult<RegisterResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var user = await registration.RegisterAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created,
            new RegisterResponse(user.Id, "Registration successful. Check your email for the verification code to activate your account."));
    }

    /// <summary>Real-time username check for the registration form (Ref 9.2).</summary>
    [AllowAnonymous]
    [HttpGet("username-availability")]
    public Task<UsernameAvailabilityResponse> UsernameAvailability([FromQuery] string username, CancellationToken ct) =>
        registration.CheckUsernameAsync(username, ct);

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpPost("verify-email")]
    public async Task<MessageResponse> VerifyEmail(VerifyEmailRequest request, CancellationToken ct)
    {
        await registration.VerifyEmailAsync(request, ct);
        return new MessageResponse("Your email address is verified. You can now log in.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("resend-verification")]
    public async Task<MessageResponse> ResendVerification(EmailRequest request, CancellationToken ct)
    {
        await registration.ResendVerificationAsync(request.Email, ct);
        return new MessageResponse("If that account still needs verification, a new code has been sent.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        var user = await auth.LoginAsync(request, ct);
        if (loginCodes.IsRequiredFor(user, Request.Cookies[RememberedCookie]))
        {
            await loginCodes.SendAsync(user, ct);
            Response.Cookies.Append(PendingCookie, loginCodes.PendingCookieFor(user), LoginCookie(loginCodes.CodeLifetime));
            return StatusCode(StatusCodes.Status202Accepted, new LoginCodeRequiredResponse(true,
                AdminLoginCodeService.EmailHint(user.Email), (int)loginCodes.CodeLifetime.TotalMinutes));
        }
        if (user.Role == UserRole.Administrator && Request.Cookies.ContainsKey(RememberedCookie))
            await loginCodes.RecordRememberedLoginAsync(user, ct);
        await SignInAsync(user);
        return Ok(ToProfile(user));
    }

    /// <summary>Leyah's second step: the code from her email. Signs her in, and remembers this browser if she asked.</summary>
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpPost("login/code")]
    public async Task<UserProfileResponse> LoginCode(LoginCodeRequest request, CancellationToken ct)
    {
        var user = await loginCodes.VerifyAsync(PendingLoginOrThrow(), request.Code, ct);
        Response.Cookies.Delete(PendingCookie, LoginCookie(TimeSpan.Zero));
        if (request.RememberDevice)
            Response.Cookies.Append(RememberedCookie, loginCodes.RememberedCookieFor(user), LoginCookie(loginCodes.RememberFor));
        await SignInAsync(user);
        return ToProfile(user);
    }

    /// <summary>"Send a new code", after a one-minute wait.</summary>
    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("login/code/resend")]
    public async Task<MessageResponse> ResendLoginCode(CancellationToken ct)
    {
        await loginCodes.ResendAsync(PendingLoginOrThrow(), ct);
        return new MessageResponse("A new code has been sent to your email.");
    }

    private PendingLogin PendingLoginOrThrow() =>
        loginCodes.ReadPending(Request.Cookies[PendingCookie])
        ?? throw new UnauthorizedAppException("Your sign-in timed out. Please log in again.", "login_pending_expired");

    /// <summary>The two login cookies: only the browser sends them back (never page scripts), only to /api/auth.</summary>
    private CookieOptions LoginCookie(TimeSpan lifetime) => new()
    {
        HttpOnly = true,
        Secure = Request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/api/auth",
        IsEssential = true,
        Expires = lifetime > TimeSpan.Zero ? DateTimeOffset.UtcNow.Add(lifetime) : null,
    };

    /// <summary>First step of a password change: checks both passwords and emails a 6-digit code. Nothing changes yet.</summary>
    [Authorize]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("change-password/code")]
    public Task<PasswordChangeCodeResponse> SendPasswordChangeCode(ChangePasswordRequest request, CancellationToken ct) =>
        security.SendPasswordChangeCodeAsync(User.GetUserId(), request, ct);

    /// <summary>
    /// Second step: both passwords again plus the code from email. Every other signed-in device is signed out, this
    /// browser stays signed in.
    /// </summary>
    [Authorize]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [HttpPost("change-password")]
    public async Task<MessageResponse> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await SignInAsync(await security.ChangePasswordAsync(User.GetUserId(), request, ct));
        return new MessageResponse("Your password has been changed. Other devices have been signed out.");
    }

    /// <summary>The client's own request to have their account deleted, if they made one.</summary>
    [Authorize]
    [HttpGet("me/deletion-request")]
    public Task<DeletionRequestResponse> DeletionRequest(CancellationToken ct) => deletionRequests.GetMineAsync(User.GetUserId(), ct);

    /// <summary>"Delete my account": asks Leyah to erase the client's personal data (password to confirm).</summary>
    [Authorize]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    [HttpPost("me/deletion-request")]
    public Task<DeletionRequestResponse> RequestDeletion(DeletionRequestRequest request, CancellationToken ct) =>
        deletionRequests.RequestAsync(User.GetUserId(), request, ct);

    /// <summary>The client changed their mind before Leyah erased the data.</summary>
    [Authorize]
    [HttpDelete("me/deletion-request")]
    public Task<DeletionRequestResponse> CancelDeletionRequest(CancellationToken ct) => deletionRequests.CancelAsync(User.GetUserId(), ct);

    [Authorize]
    [HttpPost("sign-out-other-devices")]
    public async Task<MessageResponse> SignOutOtherDevices(CancellationToken ct)
    {
        await SignInAsync(await security.SignOutEverywhereAsync(User.GetUserId(), ct));
        return new MessageResponse("Every other device has been signed out.");
    }

    [Authorize]
    [HttpGet("security")]
    public Task<AccountSecurityResponse> Security(CancellationToken ct) => security.GetAsync(User.GetUserId(), ct);

    // Session cookie; the server-side ticket expires after 30 idle minutes (Ref 8.4). The security stamp in it lets a
    // password change or "sign out other devices" end every other session.
    private Task SignInAsync(User user)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim(ClaimNames.SecurityStamp, user.SecurityStamp),
        ], CookieAuthenticationDefaults.AuthenticationScheme);
        return HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = false });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<UserProfileResponse> Me(CancellationToken ct) =>
        ToProfile(await users.GetByIdAsync(User.GetUserId(), ct) ?? throw new UnauthorizedAppException("Please log in again."));

    /// <summary>The signed-in user changes their own name and phone number; nobody can change another user's profile here.</summary>
    [Authorize]
    [HttpPut("me")]
    public async Task<UserProfileResponse> UpdateMe(UpdateProfileRequest request, CancellationToken ct) =>
        ToProfile(await registration.UpdateProfileAsync(User.GetUserId(), request, ct));

    [Authorize]
    [HttpPost("me/photo")]
    [RequestSizeLimit(ClientProfileService.PhotoMaxBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = ClientProfileService.PhotoMaxBytes + 64 * 1024)]
    public async Task<UserProfileResponse> UploadPhoto(IFormFile? file, CancellationToken ct) =>
        ToProfile(await clientProfile.UploadPhotoAsync(User.GetUserId(), file, ct));

    [Authorize]
    [HttpDelete("me/photo")]
    public async Task<UserProfileResponse> RemovePhoto(CancellationToken ct) =>
        ToProfile(await clientProfile.RemovePhotoAsync(User.GetUserId(), ct));

    /// <summary>The signed-in user's own photo; nobody else's can be fetched here.</summary>
    [Authorize]
    [HttpGet("me/photo")]
    public async Task<IActionResult> Photo(CancellationToken ct)
    {
        var photo = await clientProfile.OpenPhotoAsync(User.GetUserId(), ct);
        if (photo is null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=86400";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(photo.Value.Content, photo.Value.ContentType);
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Email)]
    [HttpPost("forgot-password")]
    public async Task<MessageResponse> ForgotPassword(EmailRequest request, CancellationToken ct)
    {
        await passwordReset.RequestResetAsync(request.Email, ct);
        return new MessageResponse(ResetRequestedMessage);
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    // POST with the token in the body: an address with ?token= would be written to web server and proxy logs.
    [HttpPost("reset-password/validate")]
    public async Task<MessageResponse> ValidateResetToken(TokenRequest request, CancellationToken ct)
    {
        await passwordReset.ValidateTokenAsync(request.Token, ct);
        return new MessageResponse("This password reset link is valid.");
    }

    [AllowAnonymous]
    [EnableRateLimiting(RateLimitPolicies.Code)]
    [HttpPost("reset-password")]
    public async Task<MessageResponse> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await passwordReset.ResetPasswordAsync(request, ct);
        return new MessageResponse("Your password has been changed. You can now log in with your new password.");
    }

    private static UserProfileResponse ToProfile(User u) =>
        new(u.Id, u.FirstName, u.LastName, u.Username, u.Email, u.PhoneNumber, u.Role.ToString(), u.CreatedAt,
            ClientProfileService.MyPhotoUrl(u));
}
