# Client emails for what the salon does — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email the client when Leyah cancels or moves their booking, and when their refund is actually sent.

**Architecture:** Three new plain-text methods on `INotificationService` / `EmailNotificationService`, queued through
`IBackgroundNotifications` after the change is saved, from `BookingService` (admin cancel, admin reschedule, manual
refund) and `OnlineRefundService` (online refund reaching Succeeded).

**Tech Stack:** ASP.NET Core 10, EF Core, xUnit, Brevo (existing sender).

**Spec:** `docs/superpowers/specs/2026-11-16-salon-action-emails-design.md`

## Global Constraints
- Plain text, same layout as the existing client emails; never the word "Xendit".
- No database change, no new setting.
- Only queued after `SaveChangesAsync` succeeds; skipped when `booking.Client` is null (walk-in).
- A client's own cancel/reschedule sends nothing new to the client.

## Review Focus
1. Walk-in (no client account) cancelled or moved by Leyah -> no email, no error. (Task 2 test)
2. Online refund still Processing -> no "refund sent" email yet; email arrives once on Succeeded, never twice on a repeated notification. (Task 3 test)
3. Refund refused (Failed) -> no email. (Task 3 test)
4. Admin cancel with nothing to refund (client stopped answering, deposit only) -> email says the deposit is kept. (Task 1 unit test)
5. Leyah's explanation absent -> no empty "—" line. (Task 1 unit test)

---

### Task 1: The three email texts

**Files:** Modify `backend/Notifications/Notifications.cs`; Test `tests/NailsByLeah.Api.Tests/Unit/ClientSalonActionEmailTests.cs`

**Produces:**
- `Task SendBookingCancelledBySalonAsync(Booking booking, string reasonLabel, string? explanation, CancellationToken ct = default)`
- `Task SendBookingMovedBySalonAsync(Booking booking, DateOnly fromDate, TimeOnly fromTime, CancellationToken ct = default)`
- `Task SendRefundSentAsync(Booking booking, CancellationToken ct = default)` — online when `booking.RefundStatus == Succeeded`.

- [ ] Tests (unit, CapturingEmailSender like SalonAlertEmailTests): cancelled email goes to the client, subject contains
  "was cancelled", body has date, reason, explanation, "PHP 300.00 will be sent back"; with RefundDue 0 body says the
  deposit is kept and has no explanation line when null; moved email has old and new date/time; refund email has amount
  and reference; online refund email says "sent back to your GCash"; no body contains "Xendit".
- [ ] Run, see them fail; implement; run, see them pass. Add no-op recording members to `CapturingNotificationService`.

### Task 2: Wire admin cancel and reschedule

**Files:** Modify `backend/Services/BookingService.cs`; Test `tests/NailsByLeah.Api.Tests/Integration/SalonActionEmailTests.cs`

- [ ] Integration tests: admin cancel -> `Notifications.ClientCancellations[id]` has the reason label; admin reschedule
  -> `ClientMoves[id]` has the old slot; client's own cancel -> nothing recorded; walk-in cancel -> nothing, 200 OK.
- [ ] Implement: in `CancelAsync` (admin) and `RescheduleAsync` (admin) queue after save when `Client` is not null.

### Task 3: Wire refund sent

**Files:** Modify `backend/Services/BookingService.cs`, `backend/Services/OnlineRefundService.cs`; Test same integration file
plus `OnlineRefundTests`.

- [ ] Tests: manual record -> `RefundSentIds` contains id once; online Pending -> not yet; webhook Succeeded -> once;
  the same webhook again -> still once; refused -> none.
- [ ] Implement: `RecordRefundAsync` queues after save; `OnlineRefundService` queues after save whenever `Settle` turned
  the booking to Succeeded (inject `IBackgroundNotifications`).
- [ ] Run unit tests here; integration tests by the user in Visual Studio. Ask before committing.
