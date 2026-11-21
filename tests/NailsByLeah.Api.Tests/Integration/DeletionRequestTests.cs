using System.Net;
using NailsByLeah.Api.Contracts;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>"Delete my account": the client asks, Leyah is told and sees it on Client data, and the request ends when she erases.</summary>
public sealed class DeletionRequestTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Url = "/api/auth/me/deletion-request";

    [Fact]
    public async Task A_client_asks_with_their_password_Leyah_is_told_and_the_request_ends_when_canceled_or_erased()
    {
        var user = await factory.CreateClientAsync();
        var admin = await factory.CreateAdminClientAsync();
        Assert.Null((await user.Client.GetAsync<DeletionRequestResponse>(Url)).RequestedAt);

        var wrong = await user.Client.PostJsonAsync(Url, new DeletionRequestRequest("Wrong12345"));
        await wrong.ShouldHaveStatus(HttpStatusCode.BadRequest);
        Assert.NotEmpty((await wrong.ReadProblemAsync()).ErrorsFor("password"));

        var asked = await user.Client.PostJsonAsync(Url, new DeletionRequestRequest(ApiFactory.DefaultPassword, "Moving abroad"));
        await asked.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.NotNull((await asked.ReadAsync<DeletionRequestResponse>()).RequestedAt);
        Assert.Single(factory.Notifications.DeletionRequestClientIds, id => id == user.Id);

        // Asking again changes nothing and doesn't email Leyah twice.
        await (await user.Client.PostJsonAsync(Url, new DeletionRequestRequest(ApiFactory.DefaultPassword))).ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Single(factory.Notifications.DeletionRequestClientIds, id => id == user.Id);

        var open = await admin.GetAsync<List<DeletionRequestItem>>("/api/admin/clients/deletion-requests");
        Assert.Contains(open, r => r.ClientId == user.Id && r.Reason == "Moving abroad");
        Assert.NotNull((await admin.GetAsync<ClientDataResponse>($"/api/admin/clients/{user.Id}")).DeletionRequestedAt);

        // A change of mind.
        var canceled = await user.Client.DeleteAsync(Url);
        await canceled.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Null((await canceled.ReadAsync<DeletionRequestResponse>()).RequestedAt);
        Assert.DoesNotContain(await admin.GetAsync<List<DeletionRequestItem>>("/api/admin/clients/deletion-requests"), r => r.ClientId == user.Id);

        // Asked again, then erased by Leyah: the request is done.
        await (await user.Client.PostJsonAsync(Url, new DeletionRequestRequest(ApiFactory.DefaultPassword))).ShouldHaveStatus(HttpStatusCode.OK);
        await (await admin.PostAsync($"/api/admin/clients/{user.Id}/delete-data", null)).ShouldHaveStatus(HttpStatusCode.NoContent);
        Assert.DoesNotContain(await admin.GetAsync<List<DeletionRequestItem>>("/api/admin/clients/deletion-requests"), r => r.ClientId == user.Id);
    }

    [Fact]
    public async Task Leyah_cannot_ask_to_delete_her_own_account_this_way()
    {
        var admin = await factory.CreateAdminClientAsync();
        await (await admin.PostJsonAsync(Url, new DeletionRequestRequest(ApiFactory.AdminPassword))).ShouldHaveStatus(HttpStatusCode.Forbidden);
    }
}
