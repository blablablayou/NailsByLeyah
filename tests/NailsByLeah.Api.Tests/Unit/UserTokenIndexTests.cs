using Microsoft.EntityFrameworkCore;
using NailsByLeah.Api.Data;
using NailsByLeah.Api.Domain;

namespace NailsByLeah.Api.Tests.Unit;

/// <summary>
/// A sign-up code has only six digits (a million possibilities) and used codes stay in user_tokens, so two people
/// will sooner or later be given the same code. The database must allow that: a code is always looked up for one user
/// (their latest), never by the code alone, so a repeat is harmless, while a unique index would make the sign-up fail.
/// </summary>
public sealed class UserTokenIndexTests
{
    private static Microsoft.EntityFrameworkCore.Metadata.IEntityType UserTokens()
    {
        // Building the model needs no database connection.
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=model-only")
            .UseSnakeCaseNamingConvention()
            .Options;
        using var db = new AppDbContext(options);
        return db.Model.FindEntityType(typeof(UserToken))!;
    }

    [Fact]
    public void The_same_code_hash_may_be_stored_for_two_people()
    {
        var index = Assert.Single(UserTokens().GetIndexes(), i => i.Properties.Select(p => p.Name).SequenceEqual([nameof(UserToken.TokenHash)]));

        Assert.False(index.IsUnique);
        Assert.Equal("ix_user_tokens_token_hash", index.GetDatabaseName());
    }

    [Fact]
    public void Codes_are_still_found_quickly_by_user_and_purpose()
    {
        Assert.Contains(UserTokens().GetIndexes(), i =>
            i.Properties.Select(p => p.Name).SequenceEqual([nameof(UserToken.UserId), nameof(UserToken.Purpose)]));
    }
}
