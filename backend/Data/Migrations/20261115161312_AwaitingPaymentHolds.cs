using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NailsByLeah.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AwaitingPaymentHolds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_bookings_active_slot",
                table: "bookings");

            migrationBuilder.AddColumn<string>(
                name: "checkout_session_id",
                table: "bookings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "checkout_url",
                table: "bookings",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "payment_hold_until",
                table: "bookings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "payment_idempotency_key",
                table: "bookings",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payment_method",
                table: "bookings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_bookings_active_slot",
                table: "bookings",
                columns: new[] { "booking_date", "start_time" },
                unique: true,
                filter: "status IN ('AwaitingPayment', 'Pending', 'Confirmed') AND NOT is_deleted");

            migrationBuilder.CreateIndex(
                name: "ux_bookings_payment_idempotency_key",
                table: "bookings",
                column: "payment_idempotency_key",
                unique: true,
                filter: "payment_idempotency_key IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_bookings_active_slot",
                table: "bookings");

            migrationBuilder.DropIndex(
                name: "ux_bookings_payment_idempotency_key",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "checkout_session_id",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "checkout_url",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "payment_hold_until",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "payment_idempotency_key",
                table: "bookings");

            migrationBuilder.DropColumn(
                name: "payment_method",
                table: "bookings");

            migrationBuilder.CreateIndex(
                name: "ux_bookings_active_slot",
                table: "bookings",
                columns: new[] { "booking_date", "start_time" },
                unique: true,
                filter: "status IN ('Pending', 'Confirmed') AND NOT is_deleted");
        }
    }
}
