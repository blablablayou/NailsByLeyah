# Payment receipt: polish

**Date:** 2026-11-16 · **Status:** approved ("Yes, polish it" + A, B, C) · **Branch:** `receipt-polish` (from main ac62e98)
No commit or push without the user's OK. No backend or database change.

## Non-goals
No fact, note or function removed: reference number, booking number, payment and method, service and add-ons with
prices, appointment, total, amount paid, balance (or refund for cancelled / no-show), status badge, the pending note
(keeps "Leyah will check it and confirm"), the deposit rule, and the PDF download that unlocks once the payment is
verified. Same component on the "Booking received!" page and in My bookings → Receipt.

## Design
1. Slip-like top: tick, "Payment received", paid date; the reference number large in a dashed box.
2. Add-ons as a price list: name on the left, price on the right on the same row.
3. Totals block under a rule: Total, Amount paid, then Balance due (or Refund) emphasised; amounts right-aligned.
4. One calm "what happens next" line; the deposit rule in small text beneath.
5. Phones (≤560 px): labels above their values; the reference fits on one line.

## Additions
- **A. Copy reference:** a Copy button beside the number ("Copied" for 2 s, announced to screen readers).
- **B. Status steps:** Paid → Leyah checks → Confirmed, with the current step marked; hidden for cancelled / no-show.
- **C. Clearer PDF button:** before verification it is an outline with a lock icon (not faded pink); the reason stays.
