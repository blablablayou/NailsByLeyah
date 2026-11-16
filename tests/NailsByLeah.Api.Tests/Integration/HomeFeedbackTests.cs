using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>
/// Leyah picks a few client comments for the home page. Each test switches back off what it switched on, because the
/// home page holds at most six and the tests in this class share one database.
/// </summary>
public sealed class HomeFeedbackTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(int Id, int ClientId)> Rated(int stars, string? comment, string firstName = "Kyla", string lastName = "Santos")
    {
        var user = await factory.CreateClientAsync();
        factory.WithDb(db =>
        {
            var u = db.Users.Single(x => x.Id == user.Id);
            (u.FirstName, u.LastName) = (firstName, lastName);
            return db.SaveChanges();
        });
        var sent = await user.Client.PostJsonAsync("/api/feedback", new SubmitFeedbackRequest(stars, comment, Guid.NewGuid()));
        return ((await sent.ReadAsync<FeedbackResponse>()).Id, user.Id);
    }

    private static Task<HttpResponseMessage> Show(HttpClient admin, int id, bool show) =>
        admin.PutJsonAsync($"/api/admin/feedback/{id}/home", new ShowOnHomeRequest(show));

    private Task<HomeFeedbackResponse> Home() => factory.NewClient().GetAsync<HomeFeedbackResponse>("/api/feedback/home");

    [Fact]
    public async Task Nothing_shows_until_Leyah_picks_it_and_then_anyone_sees_first_name_and_last_initial()
    {
        var (id, _) = await Rated(5, "Very gentle removal and a lovely design.");
        var admin = await factory.CreateAdminClientAsync();
        Assert.DoesNotContain((await Home()).Items, f => f.Id == id);

        var shown = await Show(admin, id, true);

        await shown.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.True((await shown.ReadAsync<FeedbackResponse>()).ShowOnHome);
        var home = await Home(); // no sign-in needed
        var item = Assert.Single(home.Items, f => f.Id == id);
        Assert.Equal((5, "Very gentle removal and a lovely design.", "Kyla S."), (item.Rating, item.Comment, item.Name));
        Assert.True(home.RatingCount >= 1);
        Assert.InRange(home.AverageRating!.Value, 1m, 5m);
        var listed = await admin.GetAsync<FeedbackListResponse>("/api/admin/feedback");
        Assert.True(listed.Items.Single(f => f.Id == id).ShowOnHome);

        await (await Show(admin, id, false)).ShouldHaveStatus(HttpStatusCode.OK);
        Assert.DoesNotContain((await Home()).Items, f => f.Id == id);
    }

    [Fact]
    public async Task A_rating_without_a_comment_cannot_be_shown()
    {
        var (id, _) = await Rated(4, null);
        var admin = await factory.CreateAdminClientAsync();

        var response = await Show(admin, id, true);

        await response.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("feedback_has_no_comment", (await response.ReadProblemAsync()).ProblemCode());
    }

    [Fact]
    public async Task At_most_six_show_at_once()
    {
        var admin = await factory.CreateAdminClientAsync();
        var already = (await Home()).Items.Count;
        var mine = new List<int>();
        for (var i = already; i < Feedback.MaxOnHome; i++)
        {
            var (id, _) = await Rated(5, $"Lovely set number {i}.");
            await (await Show(admin, id, true)).ShouldHaveStatus(HttpStatusCode.OK);
            mine.Add(id);
        }
        var (seventh, _) = await Rated(5, "One too many.");

        var refused = await Show(admin, seventh, true);

        await refused.ShouldHaveStatus(HttpStatusCode.Conflict);
        Assert.Equal("home_feedback_full", (await refused.ReadProblemAsync()).ProblemCode());
        Assert.Equal(Feedback.MaxOnHome, (await Home()).Items.Count);
        foreach (var id in mine)
            await (await Show(admin, id, false)).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_deleted_clients_comment_never_shows()
    {
        var (id, clientId) = await Rated(5, "Will be gone.");
        var admin = await factory.CreateAdminClientAsync();
        await (await Show(admin, id, true)).ShouldHaveStatus(HttpStatusCode.OK);

        factory.WithDb(db =>
        {
            db.Users.Single(u => u.Id == clientId).IsDeleted = true;
            return db.SaveChanges();
        });

        Assert.DoesNotContain((await Home()).Items, f => f.Id == id);
        await (await Show(admin, id, false)).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Only_Leyah_can_pick_and_a_missing_one_is_not_found()
    {
        var (id, _) = await Rated(5, "Mine.");
        var client = (await factory.CreateClientAsync()).Client;
        var admin = await factory.CreateAdminClientAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await Show(client, id, true)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Show(factory.NewClient(), id, true)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Show(admin, 999_999, true)).StatusCode);
    }
}
