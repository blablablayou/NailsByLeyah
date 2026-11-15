# Render test deployment and Xendit test-mode payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site runs on Render for the Nov 26 defense, and clients pay on Xendit's hosted GCash/Maya checkout in test mode, with a one-setting fallback to today's simulated payment.

**Architecture:** Today's one-step `IPaymentGateway.ChargeAsync` stays for `Payments:Provider=Simulated`. A new `IHostedCheckout` (Xendit Payment Sessions, `PAYMENT_LINK` mode) is used for `Provider=Xendit`: the booking is created as `AwaitingPayment` with a 15-minute hold, the checkout session is made after the transaction commits, and Xendit's webhook (or a server-side status check) turns it into today's paid `Pending` booking through the same code path that records a payment today.

**Tech Stack:** ASP.NET Core .NET 10, EF Core + Npgsql (Supabase Postgres), xUnit integration tests (`ApiFactory`), React 19 + Vite, Vitest with the mock backend, Docker on Render.

**Spec:** `docs/superpowers/specs/2026-11-16-render-and-xendit-test-design.md`

## Global Constraints

- Order: **Phase 1** Render (Task 1) → **Phase 2** Xendit test mode (Tasks 2–9) → **Phase 3** Xendit on the live site and rehearsal (Task 10). Phases run one after another; each starts when the previous one is done. Defense Nov 26.
- **Before each phase starts, tell the user what will change (code, screens/design, database, settings) and wait for their permission.** Any screen or design change inside a phase is shown to them before it is built.
- **Stop before Task 3's migration and ask the user for the database OK.** Approval of the design is not that OK.
- No commit or push without the user's OK. Work on branch `xendit-test-payments` (from `main`); Task 1 commits to `main` only with the user's OK.
- Never remove or weaken existing functions; the `Simulated` path must behave exactly as today (all existing tests pass unchanged).
- Secrets only in Render's dashboard and user secrets: `Xendit__SecretKey`, `Xendit__CallbackToken`, Brevo key, connection string. Never in chat, git or logs.
- Only the server marks a booking paid (webhook with a valid `x-callback-token`, or the server asking Xendit). Never the browser or the return address.
- Hold length `Payments:HoldMinutes` = 15. Restrict each session to the chosen channel: GCash → `GCASH`, Maya → `PAYMAYA`. Currency `PHP`.
- Booking statuses are stored as text; the slot index filter becomes `status IN ('AwaitingPayment', 'Pending', 'Confirmed') AND NOT is_deleted`.
- The backend suite is run by the user in Visual Studio (it needs the Supabase test project); while the API runs in VS, build with `-c Release`.
- Exact Xendit field names and event names come from Xendit's current Payment Sessions docs (https://docs.xendit.co/docs/payment-sessions-overview, https://docs.xendit.co/apidocs/create-session); write them down in `XenditCheckout.cs` comments with the doc link.

## Review Focus

1. A client double-taps Pay (two requests, same idempotency key) → one hold, both answers carry the same checkout address. → Task 4 test.
2. The webhook arrives before the "create booking" request has saved the session id (Xendit is fast) → the booking is still found, by our reference. → Task 5 test.
3. The client pays on Xendit after pressing "Cancel booking" in another tab → payment recorded, booking stays Cancelled, flagged for refund. → Task 5 test.
4. Leyah switches `Provider` back to `Simulated` with a hold still at Xendit → that hold's webhook still completes it. → Task 5 test.
5. Admin dashboard, reports and "payments to check" while a hold exists → the hold appears in none of them, but the slot is not offered to another client. → Task 3 test.

---

## Phase 1: Render

### Task 1: Render test deployment (with simulated payments)

**Files:**
- Already changed, uncommitted: `backend/Configuration/Options.cs`, `backend/Infrastructure/StartupTasks.cs`, `backend/Infrastructure/ServiceRegistration.cs`, `backend/appsettings.json`, `backend/README.md`, `tests/.../Unit/AllowedHostsTests.cs` (the `Payments:AllowSimulated` switch).

- [ ] **Step 1:** User runs the whole backend suite in Visual Studio. Expected: all pass.
- [ ] **Step 2:** With the user's OK, commit on `main` ("Test deployments may start with simulated payments") and push.
- [ ] **Step 3 (user, guided):** Render → New → Web Service → the GitHub repo, Runtime Docker, Region Singapore, branch `main`, Free, Health Check Path `/api/health`. Paste the environment variables from `backend/README.md` "Test deployment on Render" (AdminSeed not needed: the test project has the admin). `AllowedHosts`/`Frontend__BaseUrl` from the address Render shows.
- [ ] **Step 4:** Watch the build log. Expected: "Your service is live"; `https://<address>/api/health` → 200; `/api/health/database` → 200.
- [ ] **Step 5 (user, guided):** cron-job.org job: GET `https://<address>/api/health/database` every 10 minutes.
- [ ] **Step 6:** Check on the live site (built-in browser + the user's phone): home page loads; sign-up email code arrives and its links use the Render address; a full simulated booking; times shown in Manila time; Activity log shows the real visitor address (README Security steps for `ForwardLimit`); still signed in after a manual restart in Render. Fix anything found before Task 2's merge.

## Phase 2: Xendit test mode (on branch `xendit-test-payments`)

### Task 2: Provider settings and startup checks

**Files:**
- Modify: `backend/Configuration/Options.cs` (`PaymentOptions`), `backend/Infrastructure/StartupTasks.cs`, `backend/Infrastructure/ServiceRegistration.cs`, `backend/appsettings.json`, `backend/README.md`
- Create: `backend/Payments/PaymentProvider.cs`
- Test: `tests/NailsByLeah.Api.Tests/Unit/AllowedHostsTests.cs`

**Interfaces:**
- Produces: `enum PaymentProvider { Simulated, Xendit }`; `PaymentOptions.Provider` (default `Simulated`), `PaymentOptions.HoldMinutes` (default 15); `XenditOptions { Section = "Xendit"; string? SecretKey; string? CallbackToken; string BaseUrl = "https://api.xendit.co/"; bool IsConfigured }`; `StartupTasks.PaymentSetupProblem(PaymentProvider provider, bool allowSimulated, bool xenditConfigured) : string?`.

- [ ] **Step 1: Write the failing tests** (replace the three `PaymentGatewayProblem` tests from Task 1 with these; keep their meaning):

```csharp
[Fact] public void Simulated_on_the_live_site_needs_the_test_switch() =>
    Assert.NotNull(StartupTasks.PaymentSetupProblem(PaymentProvider.Simulated, allowSimulated: false, xenditConfigured: false));
[Fact] public void Simulated_starts_with_the_test_switch_even_with_xendit_keys_set() =>
    Assert.Null(StartupTasks.PaymentSetupProblem(PaymentProvider.Simulated, allowSimulated: true, xenditConfigured: true));
[Fact] public void Xendit_needs_its_keys() =>
    Assert.NotNull(StartupTasks.PaymentSetupProblem(PaymentProvider.Xendit, allowSimulated: false, xenditConfigured: false));
[Fact] public void Xendit_with_keys_starts() =>
    Assert.Null(StartupTasks.PaymentSetupProblem(PaymentProvider.Xendit, allowSimulated: false, xenditConfigured: true));
```

- [ ] **Step 2:** Run `dotnet test NailsByLeah.slnx -c Release --filter "FullyQualifiedName~AllowedHostsTests"`. Expected: FAIL (no `PaymentSetupProblem`).
- [ ] **Step 3:** Implement. `PaymentSetupProblem` replaces `PaymentGatewayProblem`; `EnsureProductionReady` calls it and keeps the warning log for simulated. Bind `XenditOptions`. README Configuration table: `Payments:Provider`, `Payments:HoldMinutes`, `Xendit:*`; Render table: `Payments__Provider`, `Xendit__SecretKey`, `Xendit__CallbackToken`.
- [ ] **Step 4:** Run the same command. Expected: PASS.

### Task 3: AwaitingPayment status and the migration — **ask the user for the database OK first**

**Files:**
- Modify: `backend/Domain/Enums.cs` (`BookingStatus.AwaitingPayment`, first member is fine since stored as text), `backend/Domain/Records.cs` (`Booking`), `backend/Data/EntityConfigurations.cs:125-128`, `backend/Data/Repositories.cs` (every `Pending || Confirmed` filter, lines ~265, 285, 319, 355, 360), `backend/Services/*` slot checks if they filter statuses themselves
- Create: migration `AwaitingPaymentHolds` via `dotnet ef migrations add AwaitingPaymentHolds --project backend`
- Test: `tests/NailsByLeah.Api.Tests/Integration/AwaitingPaymentTests.cs`

**Interfaces:**
- Produces on `Booking`: `DateTime? PaymentHoldUntil`, `string? CheckoutSessionId`, `string? CheckoutUrl`, `Guid? PaymentIdempotencyKey` (unique index `IndexNames.BookingsPaymentIdempotencyKey`, filtered `payment_idempotency_key IS NOT NULL`), `PaymentMethod? PendingPaymentMethod`, `PaymentOption? PendingPaymentOption` (columns `payment_hold_until`, `checkout_session_id`, `checkout_url`, `payment_idempotency_key`, `payment_method`, `payment_option`; enums as text).
- Produces in `BookingRepository`: `IQueryable<Booking> HoldsSlot` = AwaitingPayment, Pending, Confirmed (used by availability, day lock and reschedule targets); the existing `Active` (Pending, Confirmed) stays for dashboards, reports, lists and counts.

- [ ] **Step 0:** Show the user the exact migration (status value, index filter, six nullable columns, nothing deleted) and wait for "OK". Do not continue without it.
- [ ] **Step 1: Write the failing tests** in `AwaitingPaymentTests` (seed a booking directly with `factory.WithDb` as `AwaitingPayment`, `PaymentHoldUntil = now + 15 min`):
  - `A_held_slot_is_not_offered_to_another_client`: GET the day's times → that time is unavailable; booking it → 409 `slot_unavailable`.
  - `A_hold_is_not_a_booking_for_Leyah`: dashboard counts, payments to check, Next 7 days, daily and monthly report totals and the client directory booking count are the same as without the hold.
  - `The_admin_list_shows_holds_only_under_awaiting_payment`: `GET /api/admin/bookings?status=AwaitingPayment` returns it; the default list does not.
  - `A_client_sees_their_hold_as_awaiting_payment`: `GET /api/bookings` returns it with `status == "AwaitingPayment"` and `checkoutUrl` set.
- [ ] **Step 2:** User runs `AwaitingPaymentTests` in VS. Expected: FAIL (status missing).
- [ ] **Step 3:** Implement the status, columns, index filter, `HoldsSlot` and the filters; add `string? CheckoutUrl` and `DateTime? PaymentHoldUntil` to `BookingResponse` (null unless AwaitingPayment). Generate the migration and read it: only additive changes plus the index re-creation.
- [ ] **Step 4:** User runs the whole suite. Expected: all pass (existing ones unchanged).

### Task 4: Booking with Xendit creates a hold and a checkout

**Files:**
- Create: `backend/Payments/HostedCheckout.cs`
- Modify: `backend/Services/BookingService.cs` (`CreateAsync`), `backend/Contracts/Contracts.cs` (`CreateBookingResponse`), `backend/Infrastructure/ServiceRegistration.cs`
- Test: `tests/.../Integration/ApiFactory.cs` (add `TestHostedCheckout`, a second factory option `UseXendit()`), `tests/.../Integration/XenditBookingTests.cs`

**Interfaces:**
- Produces:
  - `record CheckoutRequest(int BookingId, string Reference, decimal Amount, PaymentMethod Method, DateTime ExpiresAtUtc, string SuccessUrl, string FailureUrl, string Description)`
  - `record CheckoutSession(string SessionId, string CheckoutUrl)`
  - `record CheckoutStatus(string SessionId, CheckoutState State, string? PaymentId, decimal? Amount, string? Currency)`; `enum CheckoutState { Open, Paid, Expired, Failed }`
  - `interface IHostedCheckout { Task<CheckoutSession> CreateAsync(CheckoutRequest r, CancellationToken ct); Task<CheckoutStatus> GetStatusAsync(string sessionId, CancellationToken ct); Task ExpireAsync(string sessionId, CancellationToken ct); }` (throws `HostedCheckoutException` on any provider error)
  - Our reference sent to Xendit: `$"booking-{bookingId}"`; parse back with `HostedCheckoutReference.TryParse(string, out int bookingId)`.
  - Return addresses: `{Frontend:BaseUrl}/bookings/payment?booking={id}` for both success and failure.
  - `CreateBookingResponse(BookingResponse Booking, ReceiptResponse? Receipt, string? CheckoutUrl = null)` — Receipt null and CheckoutUrl set for a hold.

- [ ] **Step 1: Write the failing tests** in `XenditBookingTests` (factory with `Payments:Provider=Xendit`, `TestHostedCheckout`):
  - `Paying_creates_a_hold_and_returns_the_checkout_address`: 201; `Booking.Status == "AwaitingPayment"`; `Receipt == null`; `CheckoutUrl == checkout.LastSession.CheckoutUrl`; amount sent = 150 for deposit; method sent = chosen; `ExpiresAtUtc == now + 15 min`; no Payment row; draft deleted; no confirmation email yet.
  - `A_repeated_pay_click_returns_the_same_hold`: same key twice → one booking, one `CreateAsync` call, same `CheckoutUrl`.
  - `If_Xendit_fails_the_slot_is_freed_and_the_client_is_told`: `checkout.FailNext()` → 502 with code `payment_unavailable` and message "The payment couldn't be started. You have not been charged. Please try again."; the booking is Cancelled (reason `PaymentNotCompleted`); the slot can be booked again.
  - `Simulated_provider_still_books_in_one_step`: provider Simulated → 201 with Receipt, status Pending (as today).
- [ ] **Step 2:** User runs `XenditBookingTests`. Expected: FAIL.
- [ ] **Step 3:** Implement. In `CreateAsync`, when `Provider == Xendit`: the existing duplicate checks also look up `bookings.FindByPaymentIdempotencyKeyAsync`; inside the transaction create the booking as `AwaitingPayment` with hold, key, method, option instead of calling `CollectAsync`; after commit call `IHostedCheckout.CreateAsync`, save `CheckoutSessionId`/`CheckoutUrl`; on `HostedCheckoutException` cancel the hold (cancellation by the client, new `ClientCancellationReason.PaymentNotCompleted`) and throw `PaymentUnavailableException` (502, `payment_unavailable`). `PaymentNotCompleted` is a system reason: the client's cancel dialog and the request validator must not offer or accept it. Audit "booking held for payment". Register the real `XenditCheckout` (Task 8) only when Xendit is configured.
- [ ] **Step 4:** User runs the whole suite. Expected: all pass.

### Task 5: Xendit webhook confirms the payment

**Files:**
- Create: `backend/Services/CheckoutConfirmationService.cs`, `backend/Controllers/XenditWebhookController.cs`
- Modify: `backend/Services/PaymentService.cs` (record a payment from a confirmed checkout using the same fields as `CollectAsync`), `backend/Infrastructure/WebsiteHosting.cs`/rate limits if the route needs an exemption
- Test: `tests/.../Integration/XenditWebhookTests.cs`

**Interfaces:**
- Consumes: Task 4's `CheckoutStatus`, `HostedCheckoutReference`.
- Produces: `ICheckoutConfirmationService.ApplyAsync(int bookingId, CheckoutStatus status, CancellationToken ct) : Task<ConfirmationOutcome>`; `enum ConfirmationOutcome { Confirmed, AlreadyHandled, Ignored, PaidButNeedsRefund }`. Route `POST /api/payments/xendit/webhook`, anonymous, CSRF/antiforgery not applicable, answers 200 for every accepted call (including duplicates and unknown events), 401 for a missing/wrong token. The controller maps Xendit's JSON to `CheckoutStatus` (fields from the docs) and finds the booking by our reference.

- [ ] **Step 1: Write the failing tests** (post a webhook JSON shaped like Xendit's paid event for the session `TestHostedCheckout` made):
  - `A_missing_or_wrong_token_changes_nothing`: no header → 401; wrong header → 401; booking still AwaitingPayment.
  - `A_paid_event_makes_it_a_paid_booking`: 200; status Pending; one Payment with Xendit's payment id as `ReferenceNumber`, amount 150, method GCash; receipt available; client confirmation and salon alert sent (`factory.Notifications`).
  - `The_same_event_twice_records_one_payment`.
  - `A_wrong_amount_or_currency_is_not_accepted`: 200, booking unchanged, audit entry "payment amount mismatch".
  - `A_paid_event_before_the_session_id_was_saved_still_finds_the_booking` (Review Focus 2): booking with `CheckoutSessionId == null`, event carries our reference → confirmed.
  - `Paid_after_the_hold_ran_out_is_reinstated_if_the_slot_is_free`.
  - `Paid_after_the_hold_ran_out_and_the_slot_was_taken_needs_a_refund`: payment recorded, booking stays Cancelled, audit + salon alert "needs a manual refund".
  - `Paid_after_the_client_cancelled_needs_a_refund` (Review Focus 3).
  - `Paid_for_a_time_already_passed_needs_a_refund`.
  - `A_hold_finishes_even_after_switching_back_to_simulated` (Review Focus 4): factory with `Provider=Simulated` and Xendit keys set → webhook still confirms.
- [ ] **Step 2:** User runs `XenditWebhookTests`. Expected: FAIL.
- [ ] **Step 3:** Implement. Token check with `CryptographicOperations.FixedTimeEquals` on UTF-8 bytes. `ApplyAsync` runs in `ExecuteInTransactionAsync` with `LockDayAsync` for the booking's date; reinstating re-checks the slot with `slots.EnsureFreeAsync` and that the start is in the future. After commit, reuse `NotifyConfirmedAsync`'s emails (move it where both services can call it, without changing what it sends). The endpoint is registered whenever `XenditOptions.IsConfigured`, whatever `Provider` says.
- [ ] **Step 4:** User runs the whole suite. Expected: all pass.

### Task 6: Return page support: status check, try again, cancel

**Files:**
- Modify: `backend/Controllers/BookingsController.cs`, `backend/Services/BookingService.cs`, `frontend/src/api/index.js`, mock backend (`frontend/src/test/mockBackend/mockApi.js`)
- Test: `tests/.../Integration/XenditWebhookTests.cs` (or `XenditReturnTests.cs`)

**Interfaces:**
- Produces:
  - `GET /api/bookings/{id}/payment-status` → `PaymentStatusResponse(string Status, string? CheckoutUrl, DateTime? HoldUntil)` where Status is `Paid`, `Waiting`, `NotCompleted`. While AwaitingPayment it calls `IHostedCheckout.GetStatusAsync` and, if Paid, `ICheckoutConfirmationService.ApplyAsync` (so a late webhook doesn't stall the demo); at most once every 5 seconds per booking.
  - `POST /api/bookings/{id}/checkout` → `{ checkoutUrl }`: only for the owner's AwaitingPayment booking inside its hold; expires the old session (`ExpireAsync`, errors ignored), creates a new one with the remaining hold time.
  - The existing `POST /api/bookings/{id}/cancel` accepts AwaitingPayment bookings (frees the slot, no refund logic, no salon alert) and expires the session.
  - `api.bookings.paymentStatus(id)`, `api.bookings.retryCheckout(id)`.

- [ ] **Step 1: Write the failing tests:** `A_hold_cannot_be_rescheduled` (409 `invalid_status`); `Status_check_confirms_a_paid_session_without_the_webhook`; `Try_again_makes_a_new_session_and_expires_the_old_one`; `Try_again_after_the_hold_ended_is_refused` (409 `hold_expired`); `Another_client_cannot_see_or_retry_my_hold` (404); `Cancelling_a_hold_frees_the_slot_and_sends_no_salon_alert`.
- [ ] **Step 2:** User runs them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** User runs the whole suite. Expected: all pass.

### Task 7: Holds that run out are released

**Files:**
- Create: `backend/Services/PaymentHoldExpiryJob.cs` (`IPaymentHoldExpiryJob.RunOnceAsync(CancellationToken) : Task<int>`) and `PaymentHoldExpiryWorker` (copy `AppointmentReminderWorker`'s loop, every `Payments:HoldCheckIntervalSeconds` = 60; 0 disables, as tests do)
- Modify: `backend/Infrastructure/ServiceRegistration.cs`, `tests/.../Integration/ApiFactory.cs` (`Payments:HoldCheckIntervalSeconds=0`)
- Test: `tests/.../Integration/XenditWebhookTests.cs`

- [ ] **Step 1: Write the failing tests:** `An_expired_hold_is_cancelled_and_its_slot_freed` (advance `factory.Clock` 16 minutes, run the job via DI → 1; booking Cancelled with reason `PaymentNotCompleted` by the client; no emails); `A_hold_still_running_is_left_alone`; `A_paid_booking_is_never_expired`.
- [ ] **Step 2:** User runs them. Expected: FAIL.
- [ ] **Step 3:** Implement (each booking in its own transaction with the day lock; skip any that is no longer AwaitingPayment).
- [ ] **Step 4:** User runs the whole suite. Expected: all pass.

### Task 8: The real Xendit client

**Files:**
- Create: `backend/Payments/XenditCheckout.cs` (`IHostedCheckout` over `HttpClient`, registered with `AddHttpClient<IHostedCheckout, XenditCheckout>`, basic auth = secret key + ":", timeout 15 s)
- Test: `tests/.../Unit/XenditCheckoutTests.cs` (fake `HttpMessageHandler`)

- [ ] **Step 1: Write the failing tests:** `Create_sends_amount_currency_channel_reference_expiry_and_return_addresses` (assert the request JSON fields per Xendit's docs: PHP, 150, the channel `GCASH`/`PAYMAYA`, `booking-{id}`, ISO expiry, success/failure URLs, `PAYMENT_LINK` mode, and the Authorization header); `Create_reads_the_session_id_and_checkout_address`; `A_provider_error_or_timeout_becomes_HostedCheckoutException`; `Get_status_maps_paid_expired_and_open`; `The_secret_key_never_appears_in_exception_messages`.
- [ ] **Step 2:** Run `dotnet test NailsByLeah.slnx -c Release --filter "FullyQualifiedName~XenditCheckoutTests"`. Expected: FAIL.
- [ ] **Step 3:** Implement from the docs; note each field's doc link in comments.
- [ ] **Step 4:** Same command. Expected: PASS.

### Task 9: Website: pay on Xendit, come back, continue later

**Files:**
- Modify: `frontend/src/pages/client/BookPage.jsx` (`pay`: if `response.checkoutUrl`, `window.location.assign(response.checkoutUrl)`; button text unchanged), `frontend/src/App.jsx` (route `bookings/payment` → client-only), `frontend/src/pages/client/MyBookingsPage.jsx` (AwaitingPayment card: "Awaiting payment", "Continue payment" → `retryCheckout` then redirect, "Cancel"; not counted as upcoming in `isActive`), admin `BookingsPage` status tab "Awaiting payment", status badge label, mock backend support
- Create: `frontend/src/pages/client/PaymentReturnPage.jsx`
- Test: `frontend/src/test/xenditPayment.test.jsx`

- [ ] **Step 1: Write the failing tests:**
  - `redirects to the checkout address after pressing Pay` (mock returns `checkoutUrl`; assert `window.location.assign` called with it).
  - `return page shows the receipt once the payment is confirmed` (status `Waiting` then `Paid` → heading "Booking received!" and the receipt).
  - `return page says it is still confirming after a minute` (fake timers; text "Still confirming. We'll email you once it's through" and a link to My bookings).
  - `return page offers try again and cancel when not completed` ("The payment wasn't completed. You have not been charged.").
  - `My bookings shows Continue payment for a hold`.
  - `the simulated flow still shows the receipt straight away` (response with receipt, no checkoutUrl).
- [ ] **Step 2:** Run `cd frontend && npx vitest run src/test/xenditPayment.test.jsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. The return page polls `paymentStatus` every 3 s for up to 60 s; reuses the existing success view (extract it from `BookPage` into a shared component without changing its output).
- [ ] **Step 4:** Run `npm test` and `npx oxlint`. Expected: all pass, 0 errors.

## Phase 3: Xendit on the live site and the rehearsal

### Task 10: Xendit on the live site and the rehearsal

- [ ] **Step 1:** Fresh whole-branch review (requesting-code-review), fix findings; user runs the whole backend suite; frontend `npm test`.
- [ ] **Step 2:** With the user's OK: merge `xendit-test-payments` into `main`, push. Render redeploys; migration applies (`Database__ApplyMigrationsOnStartup=true`).
- [ ] **Step 3 (user, guided):** Xendit dashboard (test mode): set the Payment Sessions webhook URL to `https://<address>/api/payments/xendit/webhook`; copy the test secret key and the verification token into Render (`Xendit__SecretKey`, `Xendit__CallbackToken`), set `Payments__Provider=Xendit`. Keep `Payments__AllowSimulated=true` for the fallback.
- [ ] **Step 4:** End-to-end on the live site, on a phone: book with GCash (deposit) and with Maya (full) → Xendit test page → success → receipt; one failed/cancelled payment → "not completed" → Try again; leave one unpaid 16 minutes → slot freed. Check the admin side and the emails.
- [ ] **Step 5:** Rehearse the defense script; rehearse the fallback: set `Payments__Provider=Simulated` in Render with one hold open, confirm simulated booking works and the open hold still completes; switch back to Xendit.
- [ ] **Step 6:** Update `README.md` Status (payments: Xendit test mode) and `docs/GO-LIVE-PLAN.md`; commit with the user's OK.
