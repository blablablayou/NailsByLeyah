using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OnlineRefunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "refund_requested_at",
                table: "bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "refund_status",
                table: "bookings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "refund_requested_at",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "refund_status",
                table: "bookings");
        }
    }
}
