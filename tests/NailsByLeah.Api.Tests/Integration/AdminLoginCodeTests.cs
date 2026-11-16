using System.Net;
using Microsoft.AspNetCore.Hosting;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>The site with Leyah's login code switched on (it is off for every other test class).</summary>
public sealed class AdminCodeApiFactory : ApiFactory
{
    protected override void ConfigureSettings(IWebHostBuilder builder) => builder.UseSetting("Auth:AdminLoginCode", "true");
}

/// <summary>Leyah signs in with her password, then a 6-digit code from her email; clients sign in as before.</summary>
public sealed class AdminLoginCodeTests(AdminCodeApiFactory factory) : IClassFixture<AdminCodeApiFactory>
{
    private static Task<HttpResponseMessage> Password(HttpClient client) =>
        client.PostJsonAsync("/api/auth/login", new LoginRequest(ApiFactory.AdminUsername, ApiFactory.AdminPassword));

    private static Task<HttpResponseMessage> Code(HttpClient client, string code, bool remember = false) =>
        client.PostJsonAsync("/api/auth/login/code", new LoginCodeRequest(code, remember));

    private string SentCode() => factory.Notifications.LoginCodeFor("admin@test.local");

    [Fact]
    public async Task The_password_alone_does_not_sign_Leyah_in_and_the_code_from_her_email_does()
    {
        var client = factory.NewClient();

        var step1 = await Password(client);

        await step1.ShouldHaveStatus(HttpStatusCode.Accepted);
        var asked = await step1.ReadAsync<LoginCodeRequiredResponse>();
        Assert.True(asked.CodeRequired);
        Assert.Equal("a•••@test.local", asked.EmailHint);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);

        var step2 = await Code(client, SentCode());

        await step2.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Administrator", (await step2.ReadAsync<UserProfileResponse>()).Role);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/dashboard")).StatusCode);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "LoginCodeSent")));
    }

    [Fact]
    public async Task A_wrong_code_is_refused_and_five_wrong_tries_end_that_code()
    {
        var client = factory.NewClient();
        await Password(client);
        var real = SentCode();
        var wrong = real == "000000" ? "111111" : "000000";

        for (var i = 0; i < 5; i++)
            Assert.Equal("token_invalid", (await (await Code(client, wrong)).ReadProblemAsync()).ProblemCode());

        var locked = await Code(client, real);
        Assert.Equal("token_locked", (await locked.ReadProblemAsync()).ProblemCode());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task An_expired_code_is_refused()
    {
        var client = factory.NewClient();
        await Password(client);
        var code = SentCode();

        factory.Clock.Advance(TimeSpan.FromMinutes(11));

        var late = await Code(client, code);
        Assert.Contains((await late.ReadProblemAsync()).ProblemCode(), new[] { "token_expired", "login_pending_expired" });
    }

    [Fact]
    public async Task A_new_code_replaces_the_old_one_after_the_wait()
    {
        var client = factory.NewClient();
        await Password(client);
        var first = SentCode();

        var tooSoon = await client.PostAsync("/api/auth/login/code/resend", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, tooSoon.StatusCode);

        factory.Clock.Advance(TimeSpan.FromSeconds(61));
        await (await client.PostAsync("/api/auth/login/code/resend", null)).ShouldHaveStatus(HttpStatusCode.OK);
        var second = SentCode();

        if (first != second)
            Assert.Equal("token_invalid", (await (await Code(client, first)).ReadProblemAsync()).ProblemCode());
        await (await Code(client, second)).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_code_without_the_password_step_is_refused()
    {
        var stranger = factory.NewClient();

        var response = await Code(stranger, "123456");

        await response.ShouldHaveStatus(HttpStatusCode.Unauthorized);
        Assert.Equal("login_pending_expired", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task A_remembered_device_skips_the_code_until_the_password_changes()
    {
        var client = factory.NewClient();
        await Password(client);
        await (await Code(client, SentCode(), remember: true)).ShouldHaveStatus(HttpStatusCode.OK);
        await client.PostAsync("/api/auth/logout", null);

        var again = await Password(client);
        await again.ShouldHaveStatus(HttpStatusCode.OK); // signed in straight away on this browser

        await (await client.PostAsync("/api/auth/sign-out-other-devices", null)).ShouldHaveStatus(HttpStatusCode.OK);
        await client.PostAsync("/api/auth/logout", null);
        await (await Password(client)).ShouldHaveStatus(HttpStatusCode.Accepted); // every remembered device was forgotten
    }

    [Fact]
    public async Task A_remembered_device_ends_after_30_days()
    {
        var client = factory.NewClient();
        await Password(client);
        await (await Code(client, SentCode(), remember: true)).ShouldHaveStatus(HttpStatusCode.OK);
        await client.PostAsync("/api/auth/logout", null);

        factory.Clock.Advance(TimeSpan.FromDays(31));

        await (await Password(client)).ShouldHaveStatus(HttpStatusCode.Accepted);
    }

    [Fact]
    public async Task Clients_sign_in_with_their_password_alone()
    {
        var user = await factory.CreateClientAsync(); // signs in with the password and expects 200
        Assert.Equal(HttpStatusCode.OK, (await user.Client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task A_wrong_password_gives_no_code()
    {
        var client = factory.NewClient();
        var before = factory.Notifications.LoginCodesSent;

        var response = await client.PostJsonAsync("/api/auth/login", new LoginRequest(ApiFactory.AdminUsername, "Wrong-password-1"));

        await response.ShouldHaveStatus(HttpStatusCode.Unauthorized);
        Assert.Equal(before, factory.Notifications.LoginCodesSent);
    }
}

/// <summary>With the switch off (every other test class), Leyah signs in with her password alone.</summary>
public sealed class AdminLoginCodeSwitchedOffTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task The_password_signs_Leyah_in_and_no_code_is_sent()
    {
        var client = factory.NewClient();

        var login = await client.PostJsonAsync("/api/auth/login", new LoginRequest(ApiFactory.AdminUsername, ApiFactory.AdminPassword));

        await login.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal(0, factory.Notifications.LoginCodesSent);
    }
}
