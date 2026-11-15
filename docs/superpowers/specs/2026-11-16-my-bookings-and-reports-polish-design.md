# My bookings and Sales reports: polish

**Date:** 2026-11-16 · **Status:** approved ("Yes, polish it" ×2 + A, B, C, D) · **Branch:** `pages-polish` (from receipt-polish)
No commit or push without the user's OK. No backend or database change.

## Non-goals
No function or figure removed. My bookings keeps: tabs and counts, draft card, colour / per-nail / colour request,
add-ons, total, paid (full/deposit), balance, note, photos, cancellation and refund lines, Receipt / Reschedule /
Cancel with the reschedule rules and hints. Sales reports keeps: Daily and Monthly, the pickers, Download Excel, every
figure with its hint, and the notes line. The only text dropped is the empty "Note: No note" (user approved).

## My bookings
1. A date leaf (month, day, weekday) beside the time and service; status on the right.
2. Colour lines and add-ons grouped by hand ("Left hand  French Tip × 5, Cat Eye Polish × 5").
3. Total / Paid / Balance as three labelled figures.
4. The note only when there is one.
5. Two columns of cards from 900 px; actions in one row (Receipt, Add to calendar · Reschedule, Cancel).
- **A.** Upcoming cards show "Today", "Tomorrow" or "In N days".
- **B.** "Add to calendar" downloads an .ics file (Asia/Manila times, salon address) — `lib/calendar.js`.

## Sales reports
1. Sentence-case labels; no uppercase eyebrows or side stripes.
2. "Total received" as the big figure with online vs balances; Completed services and Balances unpaid beside it.
3. Made / Cancelled / No-show in one compact row (stacked on phones).
4. Picker with a "Today" / "This month" jump (shown only when away from it); Download Excel on the right.
5. "Nothing was paid or booked on this day/month." above the zero figures.
- **C.** Monthly: bars of money received per day (single series, no legend, hover tooltip, a table for screen readers).
- **D.** Each money figure shows the change against the day / month before.

## Known, out of scope
The monthly report takes the server about 3.6 s (also behind the dashboard's slow "This month"); a backend speed fix
is separate work.

## Excel download: Crystal Reports layout (added 2026-11-16, user's request)
One sheet "Sales Report" laid out like a printed Crystal report: header band (NAILS BY LEYAH, Sales Report, Period, Printed
date), grey column-heading band repeated on every printed page, one detail row per day with activity (a daily report has
one row for its day), Grand Total with SUM formulas and a double rule, a Summary band with every figure of the old Summary
sheet, and a printed footer with the note and "Page &P of &N". Arial 10, A4 portrait, fit to width. Replaces the old
Summary and Days sheets; no figure dropped.
