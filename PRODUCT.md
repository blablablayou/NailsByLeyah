# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Clients** of a home-based nail salon in Quezon City: they browse services and prices, sign up, book a time, pay a deposit by GCash or Maya, and manage their bookings.
- **Leyah (Leah), the owner and only nail technician**, on the admin side: she confirms payments, runs her day's appointments, records balances, no-shows and refunds, and manages services, schedule, clients and the gallery. She uses the admin side on her phone and on a laptop about equally (confirmed 2026-11-15).

## Product Purpose

Nails by Leyah lets clients book and pay a deposit online instead of messaging back and forth, and gives Leyah one place to run her bookings. Success for the admin side: Leyah sees at once what needs her action (payments to check, did-they-come, balances, refunds, colour requests), then her day and her next client, without hunting.

## Operating Context

- Appointments by booking only; no walk-ins on the public site (Leyah can still enter walk-ins in admin).
- A ₱150 non-refundable deposit secures a booking; bookings stay Pending until Leyah checks the payment and confirms.
- The admin dashboard is opened at the start of the day and between clients; the first thing Leyah needs is **what needs her action** (confirmed 2026-11-15), then today's schedule and the next client.

## Capabilities and Constraints

- React 19 + Vite frontend; ASP.NET Core backend with PostgreSQL (Supabase).
- Admin pages: Dashboard, Bookings, Services, Schedule, Clients, Gallery, Reports, Feedback, Activity log.
- School project with written requirements in `frontend/inputs/` and `backend/inputs/` (referenced in code as "Ref x.y").

## Brand Commitments

- Name: Nails by Leyah. Script wordmark "Nails by Leyah · Nail Studio".
- Palette in use: cream, blush and burgundy. The admin side keeps the same brand but **calmer and more practical** than the public landing page (confirmed 2026-11-15).

## Evidence on Hand

- Real gallery photos in `frontend/public/img/` and Leah's own uploads; Leyah's photo `frontend/public/img/leyah.webp`.
- No testimonials or reviews to quote; do not invent any.

## Product Principles

1. Action first: what needs Leyah's attention comes before anything she only reads.
2. One glance per question: who's next, what's today, what's pending, each answerable without scrolling or opening anything.
3. Works one-handed on a phone and comfortably on a laptop.
4. Brand in the details, not in decoration: the admin side is a tool.
