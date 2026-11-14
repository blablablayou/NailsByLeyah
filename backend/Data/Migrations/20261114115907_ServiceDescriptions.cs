using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ServiceDescriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Home page line per service, written on admin Services. Existing rows start empty; nothing else changes.
            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "services",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "description",
                table: "services");
        }
    }
}
