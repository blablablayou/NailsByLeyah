using System.Net;
using NailsByLeah.Api.Contracts;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Integration;

/// <summary>Leyah changes the caption of a gallery photo after uploading it (the design shown with the larger photo).</summary>
public sealed class GalleryCaptionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(HttpClient Admin, int PhotoId)> PhotoAsync(string? caption)
    {
        var admin = await factory.CreateAdminClientAsync();
        var id = factory.WithDb(db =>
        {
            var photo = new GalleryPhoto
            {
                FileName = $"{Guid.NewGuid():N}.jpg",
                ContentType = "image/jpeg",
                Caption = caption,
                CreatedAt = ApiFactory.StartTime.UtcDateTime,
                CreatedByUserId = db.Users.Single(u => u.Role == UserRole.Administrator).Id,
            };
            db.GalleryPhotos.Add(photo);
            db.SaveChanges();
            return photo.Id;
        });
        return (admin, id);
    }

    [Fact]
    public async Task Leyah_changes_a_caption_and_everyone_sees_the_new_one()
    {
        var (admin, id) = await PhotoAsync("Very good");

        var response = await admin.PutJsonAsync($"/api/admin/gallery/{id}/caption", new GalleryCaptionRequest("  Pink French tips with hand-painted flowers "));

        await response.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Equal("Pink French tips with hand-painted flowers", (await response.ReadAsync<GalleryPhotoResponse>()).Caption);
        var shown = await factory.NewClient().GetAsync<List<GalleryPhotoResponse>>("/api/gallery");
        Assert.Equal("Pink French tips with hand-painted flowers", shown.Single(p => p.Id == id).Caption);
        Assert.True(factory.WithDb(db => db.AuditLogs.Any(a => a.Action == "GalleryCaptionChanged" && a.EntityId == id.ToString())));
    }

    [Fact]
    public async Task An_empty_caption_removes_it_and_a_too_long_one_is_refused()
    {
        var (admin, id) = await PhotoAsync("Very good");

        var tooLong = await admin.PutJsonAsync($"/api/admin/gallery/{id}/caption", new GalleryCaptionRequest(new string('x', 500)));
        var cleared = await admin.PutJsonAsync($"/api/admin/gallery/{id}/caption", new GalleryCaptionRequest("   "));

        await tooLong.ShouldHaveStatus(HttpStatusCode.BadRequest);
        await cleared.ShouldHaveStatus(HttpStatusCode.OK);
        Assert.Null(factory.WithDb(db => db.GalleryPhotos.Single(p => p.Id == id).Caption));
    }

    [Fact]
    public async Task Clients_cannot_change_captions()
    {
        var (_, id) = await PhotoAsync("Very good");
        var user = await factory.CreateClientAsync();

        await (await user.Client.PutJsonAsync($"/api/admin/gallery/{id}/caption", new GalleryCaptionRequest("Mine")))
            .ShouldHaveStatus(HttpStatusCode.Forbidden);
        Assert.Equal("Very good", factory.WithDb(db => db.GalleryPhotos.Single(p => p.Id == id).Caption));
    }
}
