# Refunds in the sales reports (Phase B) — design

Approved by the user on 2026-11-17 ("Oo, simulan ang Phase B"). Small change.

## Why
The report's big figure, "Total received", counts every peso that came in but never takes off the refunds Leyah sent
back, so it shows more than she actually kept. For the defense (Nov 26) and kept right for go-live.

## Goals
1. Daily and monthly reports carry `refundsSent`: the refunds actually sent in that period, counted on the day they
   were sent (`RefundSentAt`), not the day the booking was cancelled. An online refund still Processing is not counted;
   it counts once it has Succeeded (that is when `RefundSentAt` is set).
2. The Sales hero becomes "Net received" = online + balances − refunds sent, with the parts underneath
   ("₱X online · ₱Y in balances · −₱Z refunds sent"; the refunds part only when there were any) and the change against
   the period before.
3. The Excel export gets "Refunds sent" and "Net received" columns after "Total received"; Net is a formula
   (Total − Refunds) and the Grand Total sums every column, so the sheet stays right if Leyah edits a figure.

## Non-goals
- The daily bar chart stays money received (it would go below zero on a day with a big refund).
- No database change, no new setting.

## Approaches
- **Chosen:** one new query (refunds sent between two times) and one new field on each report; the page and Excel
  work out Net from it.
- A separate "Refunds" section on the page: more to read, and the hero would still overstate what Leyah kept.
