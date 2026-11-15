using NailsByLeah.Api.Infrastructure;
using NailsByLeah.Api.Payments;

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
    public void Simulated_on_the_live_site_needs_the_test_switch() =>
        Assert.NotNull(StartupTasks.PaymentSetupProblem(PaymentProvider.Simulated, allowSimulated: false, xenditConfigured: false));

    [Fact]
    public void Simulated_starts_with_the_test_switch_even_with_xendit_keys_set() =>
        Assert.Null(StartupTasks.PaymentSetupProblem(PaymentProvider.Simulated, allowSimulated: true, xenditConfigured: true));

    [Fact]
    public void Xendit_needs_its_keys() =>
        Assert.NotNull(StartupTasks.PaymentSetupProblem(PaymentProvider.Xendit, allowSimulated: false, xenditConfigured: false));

    [Fact]
    public void Xendit_with_keys_starts() =>
        Assert.Null(StartupTasks.PaymentSetupProblem(PaymentProvider.Xendit, allowSimulated: false, xenditConfigured: true));
}
