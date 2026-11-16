# Nails by Leyah

Booking and management website for **Nails by Leyah**, a one-person nail studio: clients book and pay a deposit
online, and Leyah runs her day, her bookings and her sales from one admin area.

- `backend/` — C# ASP.NET Core Web API (.NET 10) with PostgreSQL (Supabase). Setup, configuration and API reference: [backend/README.md](backend/README.md)
- `tests/` — backend unit and integration tests ([backend/TESTING.md](backend/TESTING.md))
- `frontend/` — React 19 (Vite). [frontend/README.md](frontend/README.md)
- `docs/` — the plan for going live: [docs/GO-LIVE-PLAN.md](docs/GO-LIVE-PLAN.md); design notes and plans for each
  piece of work in [docs/superpowers/](docs/superpowers/)

## What it does

**For clients**
- Landing page with services and prices, a gallery of Leyah's work, FAQ, and "Meet Leyah".
- Sign up with email verification; profile with photo.
- **Book an appointment** in three steps: service, removal, design and nail art (per hand, per nail); a colour from the
  salon's 58-shade chart (one shade, a colour for each nail, "not sure yet", or a colour request); design reference
  photos and a note; date and time from the real schedule; then a summary and the payment step (deposit or full
  payment, GCash or Maya, Booking & Payment Policy read and agreed). Unfinished bookings are saved as drafts.
- **My bookings**: upcoming, completed and cancelled appointments; reschedule (24 h rule) and cancel; payment receipt
  with a PDF once the payment is verified; **Add to calendar**.

**For Leyah (admin)**
- **Dashboard**: what needs her (payments to check, balances, open bookings), today's schedule, the next client,
  this month and the next 7 days; quick New booking and Block time.
- Bookings (find, filter, confirm, reschedule, cancel with refunds, no-show, balance received), schedule and blocked
  times, services and prices, nail art, colour stock, gallery, feedback, client directory and client data erasure,
  activity log, salon profile.
- **Sales reports**: daily and monthly figures, a day-by-day chart, comparison with the day or month before, and an
  **Excel download** laid out like a printed report.

## Status

- **Test deployment** on Render: https://nailsbyleyah.onrender.com, using the Supabase **test** project (set-up in
  [backend/README.md](backend/README.md#test-deployment-on-render)).
- **Payments: Xendit in test mode** (no real money). Pressing Pay holds the time slot for 15 minutes and sends the
  client to Xendit's GCash or Maya page; Xendit's webhook (or the site asking Xendit) marks it paid, and Leyah confirms
  it as before. Unpaid holds are released automatically and never show in Leyah's dashboard or reports.
- **Refunds:** a refund owed on a booking paid on Xendit's page goes back to the client's GCash or Maya from the
  refund window ("Send refund"); it shows as processing until Xendit's `refund.succeeded` or `refund.failed` arrives.
  Anything else, or a refund that didn't go through, Leyah sends herself and records ("I sent it myself"). The
  website never names Xendit to Leyah or the client.
- **Fallback:** setting `Payments__Provider=Simulated` on Render switches back to the simulated payment (approves at
  once) without a code change; payments already started on Xendit still finish.
- Before real clients: Xendit live mode (business verification), database backups, connection retries, a separate live
  Supabase project. See [docs/GO-LIVE-PLAN.md](docs/GO-LIVE-PLAN.md).

## Run (frontend connected to the backend)

First-time setup (development certificate, local tools, administrator account) is in [backend/README.md](backend/README.md).

1. Backend (https://localhost:7199):

   ```bash
   dotnet run --project backend/NailsByLeah.Api.csproj --launch-profile https
   ```

2. Frontend (http://localhost:5173), in a second terminal:

   ```bash
   cd frontend
   npm run dev
   ```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the backend, so the app and the API
share one origin and the login cookie works without CORS.

## Test

```bash
dotnet test NailsByLeah.slnx
```

```bash
cd frontend
npm test
```

The backend tests run against the Postgres test database in user secrets (`ConnectionStrings:Tests`, or else
`ConnectionStrings:Default`). Each test class gets its own temporary schema there, dropped when it finishes.

## Security at a glance

- Passwords hashed with bcrypt; accounts lock for 15 minutes after 5 wrong passwords; sessions end after 30 idle minutes.
- Rate limits on sign-in, sign-up, password reset, code checks, bookings, uploads and feedback (`RateLimits` in `backend/appsettings.json`).
- "Forgot password" and "resend code" answer identically, and equally fast, for registered and unknown emails.
- Logs hold no client emails, phone numbers, passwords or reset links; reset links carry the token after `#`, which never reaches a server.
- Leyah can erase a client's personal data on request (**Client data** in the admin menu); sales records stay correct.
- Details: [backend/README.md](backend/README.md#security).
