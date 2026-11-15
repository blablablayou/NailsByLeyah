# Render test deployment and Xendit test-mode payments: design

Status: draft for the user's approval. Date: 2026-11-16. Defense: 2026-11-26.

## Intent

The site is shown at a defense (a presentation, not yet the final capstone) on 2026-11-26. The panel should see a real
site on the internet that they can open on their own phones, and the whole client flow working end to end, including
paying on a real payment provider's page. Nobody pays real money: everyone watching knows payments are a simulation.

PayMongo, HitPay and Stripe are ruled out (they need real business documents). Payments use **Xendit in test mode**.

## Goals

- The site runs on Render at a public `https://…onrender.com` address, built from `main` by the existing `Dockerfile`.
- Client books → is sent to Xendit's hosted GCash or Maya checkout (test mode) → comes back to the site → the booking
  shows as paid and waits for Leyah, exactly as a paid booking does today (status Pending, receipt, emails).
- A one-setting fallback on defense day: if Xendit or its test mode misbehaves, switching `Payments__Provider` back to
  `Simulated` in Render restores today's instant simulated payment, with no code change and no redeploy of code.

## Non-goals (on hold by the user)

- Real money, Xendit live mode, business verification.
- Database backups (`pg_dump`), database connection retries.
- A separate live Supabase project, own domain, own email domain in Brevo, paid Render plan.
- Refunds through Xendit (refunds stay manual, as today).

## Anti-goals (would be a failure even if it technically works)

- A booking marked paid because the browser said so. Only Xendit's server-to-server notification (or a server-side
  status check against Xendit) can mark a booking paid.
- Two clients holding or getting the same time slot.
- A slot stuck "awaiting payment" forever because a client closed the Xendit page.
- The defense demo depending on something that can only be fixed by changing code that day.
- Removing or weakening anything that works today (the user's rule: remove no functions).

## Constraints

- **Database changes need the user's explicit OK** before they are made (standing rule). This design needs one
  migration (below); approving this document is not that OK — ask again before writing the migration.
- No commits or pushes without the user's OK. Feature work on a branch.
- Secrets (Xendit keys, callback token, Brevo key, connection string, admin password) go only into Render's dashboard
  and user secrets, never into chat or git.
- Render free plan: sleeps after ~15 idle minutes; a keep-awake ping on `/api/health/database` every 10 minutes.
- Xendit only calls public HTTPS addresses (no localhost), so its webhook works only on the deployed site (or through
  a tunnel).
- The live site already refuses to start with simulated payments unless `Payments__AllowSimulated=true`
  (built, not yet committed). That stays.

## Approaches considered

- **A. Render first with simulated payments, then Xendit, keeping simulated as a switchable fallback. Chosen by the
  user.** A working public site exists in the first days, the first Docker build's surprises surface early, Xendit
  gets a public webhook address to call, and defense day has a plan B.
- B. Build Xendit locally first (through a tunnel such as ngrok), deploy once at the end. Rejected: the first ever
  Docker build and the Render settings would be tried only days before the defense.
- C. Xendit only, no fallback. Rejected: less code, but nothing to fall back to if the test mode or the network
  misbehaves during the presentation.

## Schedule

Phases, done one after another (each starts when the previous one is finished), well before the Nov 26 defense:

1. **Phase 1 — Render.** Commit the `Payments:AllowSimulated` switch (user's OK). Create the Render Web Service
   (Docker, Singapore, branch `main`, health check `/api/health`), set the environment variables listed in
   `backend/README.md` "Test deployment on Render", point it at the Supabase **test** project, set up the
   keep-awake ping. Check on the live site: time zone, email links, Activity log visitor address, sign-in after a
   restart, a full simulated booking.
2. **Phase 2 — Xendit test mode** (design below), on a branch, merged and deployed with the user's OK.
3. **Phase 3 — Xendit on the live site and rehearsal** of the exact defense script, on a phone and a laptop,
   plus a rehearsal of the fallback switch.
4. Nov 26 — defense.

## How the Xendit payment works

### Choosing the provider

New setting `Payments:Provider` = `Simulated` (default) or `Xendit`. With `Simulated`, everything works exactly as
today (one-step charge inside the booking transaction). With `Xendit`, the booking flow below applies. Xendit settings:
`Xendit:SecretKey` (test secret key) and `Xendit:CallbackToken` (the webhook verification token from Xendit's
dashboard). The site refuses to start with `Provider=Xendit` and either setting missing.

### Xendit product

Use Xendit's **Payment Sessions** API in hosted `PAYMENT_LINK` mode (Xendit's current hosted checkout; the older
Invoice API is now "legacy"). The session is restricted to the channel the client already picked on our payment step
(`GCASH` or `PAYMAYA`), so receipts keep showing the method. Exact field and event names must be taken from Xendit's
current docs at build time (see "Left to the builder").

### Flow

1. **Client presses Pay** on the existing payment step. The server, in one transaction (the existing day lock and
   checks), creates the booking with a new status **`AwaitingPayment`** and a hold that ends 15 minutes later. The
   amount is worked out by the server from stored prices, as today. The draft is deleted as today.
2. **After that transaction commits**, the server asks Xendit for a payment session (amount, PHP, the chosen
   channel, our booking reference, success and failure return addresses, expiry = the hold's end). It saves Xendit's
   session id and checkout address on the booking and answers the browser with the checkout address.
   If Xendit refuses or doesn't answer, the hold is cancelled at once (slot freed) and the client sees "The payment
   couldn't be started. You have not been charged. Please try again."
3. **The browser goes to Xendit's page**; the client completes the test payment.
4. **Xendit calls our webhook** `POST /api/payments/xendit/webhook` (anonymous; rate limit exempt or generous).
   It is accepted only if the `x-callback-token` header equals `Xendit:CallbackToken` (constant-time comparison;
   missing or wrong → 401, nothing changes). For a "paid" event: find the booking by Xendit's session id, check the
   amount and currency equal what we stored, then do exactly what a successful payment does today — record the
   `Payment` (Xendit's payment id as the reference number, status Succeeded), booking becomes **Pending** (paid,
   waiting for Leyah), activity log entry, client confirmation and salon alert emails through the existing queue.
   The same event arriving twice changes nothing the second time and still answers 200.
5. **The client returns** to a new page `/bookings/payment?booking=<id>`. It shows "Confirming your payment…" and
   asks our server every few seconds for the booking's status, for up to about a minute:
   - paid → the existing receipt;
   - still waiting → "Still confirming. We'll email you once it's through", with a link to My bookings;
   - failed/expired → "The payment wasn't completed. You have not been charged.", with "Try again" (a new session for
     the same held booking while the hold lasts) and "Cancel booking".
   While waiting, the page may also ask the server to check the session's status with Xendit directly (server to
   server), so a delayed webhook doesn't stall the demo. Either way only our server decides "paid".
6. **Holds that run out.** The existing background-worker pattern gets a job (every minute) that turns
   `AwaitingPayment` bookings whose hold has ended into **Cancelled** with a system reason ("payment not completed"),
   freeing the slot. No emails for these.
7. **Payment arriving after the hold ended:** if the slot is still free, the booking is reinstated and handled as
   paid (step 4). If someone else has taken the slot, the payment is recorded, the booking stays Cancelled, the
   activity log and a salon alert say it needs a manual refund.

### Where `AwaitingPayment` counts

- **Holds the slot:** the unique "active slot" index and every availability check (time list, calendar, day lock
  checks, reschedule targets) treat it like Pending/Confirmed.
- **Not shown as a real booking:** not in Leyah's "payments to check", dashboard counts, Next 7 days, today's
  schedule, sales reports, Excel export, or the client directory counts. Shown in the admin Bookings list only under
  a filter/tab "Awaiting payment", and in the client's My bookings as "Awaiting payment — Continue payment" (back to
  the checkout while the hold lasts).
- **Client actions:** a client may cancel an awaiting booking (slot freed, nothing to refund); reschedule is not
  offered until it is paid.
- Admin "New booking" (Leyah records cash/GCash she received herself) and "Balance received" are unchanged.

### Edge cases (decided)

- **Repeat Pay clicks.** The request's idempotency key is stored on the booking itself (no `Payment` row exists yet),
  so a second click with the same key returns the same held booking and its checkout address, never a second hold.
- **Finding the booking from Xendit's event.** By our own reference (the booking id, sent to Xendit as the session's
  reference), not by the session id, so a payment on any session made for that booking is found. "Try again" first
  asks Xendit to expire the previous session, then makes a new one; the booking stores only the latest session.
- **Expired holds and the canceller.** A cancellation must name a user; the expiry job records the client as the
  canceller with the system reason "payment not completed". No new column.
- **Paid after the client cancelled it themselves:** never reinstated (they chose to cancel); the payment is recorded
  and flagged for a manual refund (activity log + salon alert).
- **Reinstating a late payment** (hold ran out, nobody cancelled) only if the slot is still free **and** the
  appointment is still in the future; otherwise recorded and flagged for a manual refund.
- **Switching back to Simulated on defense day.** The webhook and the server-side status check stay active whenever
  the Xendit keys are set, whatever `Payments:Provider` says, so holds already sent to Xendit still finish. The
  startup check allows Xendit keys with `Provider=Simulated`. The rehearsal tests the switch with one hold open.

## Database change (needs the user's separate OK before it is written)

One migration:
- Booking status value `AwaitingPayment` (statuses are stored as text, so no data changes), and the filtered unique
  slot index widened to `status IN ('AwaitingPayment', 'Pending', 'Confirmed')`.
- On `bookings`, five nullable columns: `payment_hold_until` (timestamp), `checkout_session_id` (text),
  `checkout_url` (text), `payment_idempotency_key` (uuid, unique when set) and `payment_method` (the chosen GCash or
  Maya, text), plus the chosen payment option (deposit or full) if it is not already derivable — the builder checks.

Existing rows are untouched; nothing is deleted. It is applied to the Supabase test project only.

## Testing

- A fake Xendit gateway for backend tests; tests cover: hold created and slot taken; Xendit failure frees the slot;
  webhook with wrong/missing token rejected; correct paid event → Pending + one Payment + emails queued; duplicate
  event idempotent; wrong amount rejected; expiry job frees the slot; late payment reinstated / flagged; the
  `Simulated` provider path unchanged (existing tests keep passing).
- Frontend tests (mock backend) for the redirect, the return page states, My bookings "Continue payment".
- Manual run on the deployed site in Xendit test mode, both GCash and Maya, and the fallback switch.
- The user runs the backend suite in Visual Studio, as usual.

## My calls (the user can override)

- Hold length 15 minutes.
- The client keeps choosing GCash or Maya on our page; Xendit's page shows only that channel.
- Expired holds become Cancelled (kept for the record) rather than deleted.
- Defense uses the Supabase test project and its existing admin account.
- All the "Edge cases (decided)" above.

## Left to the builder

- Exact Xendit request/response fields, the paid/expired event names, and how test mode simulates success and
  failure for GCash/Maya: read from Xendit's current Payment Sessions docs.
- Whether to add the server-side status check in step 5 (recommended for demo reliability).
- Wording of new messages, following the site's existing tone.
- Which existing queries need `AwaitingPayment` added, following "Where `AwaitingPayment` counts".

## Sources

- [Xendit: Payment Sessions overview](https://docs.xendit.co/docs/payment-sessions-overview)
- [Xendit: migrate from Invoice to Payment Session](https://docs.xendit.co/docs/migrate-to-payment-session)
- [Xendit: create session](https://docs.xendit.co/apidocs/create-session)
- [Xendit: webhooks](https://help.xendit.co/hc/en-us/articles/360038048871-How-Do-I-Set-and-Update-The-Webhook-URL)
