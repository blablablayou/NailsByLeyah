using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class UserTokenHashNotUnique : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_user_tokens_token_hash",
                table: "user_tokens");

            migrationBuilder.CreateIndex(
                name: "ix_user_tokens_token_hash",
                table: "user_tokens",
                column: "token_hash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_user_tokens_token_hash",
                table: "user_tokens");

            migrationBuilder.CreateIndex(
                name: "ux_user_tokens_token_hash",
                table: "user_tokens",
                column: "token_hash",
                unique: true);
        }
    }
}
