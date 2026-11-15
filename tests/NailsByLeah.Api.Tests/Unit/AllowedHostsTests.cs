using NailsByLeah.Api.Infrastructure;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>The live site refuses to start unless AllowedHosts names its real address.</summary>
public sealed class AllowedHostsTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    [InlineData("*.onrender.com")]
    [InlineData("nailsbyleyah.onrender.com;*")]
    [InlineData("localhost;127.0.0.1;[::1]")]
    public void Wildcards_and_local_addresses_are_not_enough_for_the_live_site(string? allowedHosts) =>
        Assert.NotNull(StartupTasks.AllowedHostsProblem(allowedHosts));

    [Theory]
    [InlineData("nailsbyleyah.onrender.com")]
    [InlineData("nailsbyleyah.com;www.nailsbyleyah.com")]
    public void Real_addresses_are_accepted(string allowedHosts) =>
        Assert.Null(StartupTasks.AllowedHostsProblem(allowedHosts));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("nailsbyleyah.com")]
    [InlineData("http://nailsbyleyah.com")]
    [InlineData("https://localhost:5173")]
    [InlineData("https://127.0.0.1")]
    public void Emailed_links_need_the_real_https_address(string? baseUrl) =>
        Assert.NotNull(StartupTasks.WebsiteAddressProblem(baseUrl));

    [Fact]
    public void A_real_https_address_works_for_emailed_links() =>
        Assert.Null(StartupTasks.WebsiteAddressProblem("https://nailsbyleyah.onrender.com"));

    [Fact]
    public void The_live_site_refuses_simulated_payments_unless_a_test_deployment_allows_them() =>
        Assert.NotNull(StartupTasks.PaymentGatewayProblem(isSimulated: true, allowSimulated: false));

    [Fact]
    public void A_test_deployment_may_start_with_simulated_payments() =>
        Assert.Null(StartupTasks.PaymentGatewayProblem(isSimulated: true, allowSimulated: true));

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_real_gateway_always_starts(bool allowSimulated) =>
        Assert.Null(StartupTasks.PaymentGatewayProblem(isSimulated: false, allowSimulated));
}
