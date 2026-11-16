# Paying the balance online (Phase C, part 2) — design

Approved by the user on 2026-11-17 ("Oo, simulan"), including the one database change. A project-sized change: it
touches payments and refunds.

## Why
Today only the deposit (or the full amount) is paid online when booking; the rest is paid at the salon and Leyah
records it. Letting a client settle the balance online before the appointment saves both of them that step, and
"complete for go-live" means a refund must still go back right after such a second payment.

## Goals
1. My Bookings: a Confirmed booking with a balance left, whose time is still ahead, offers "Pay balance online (PHP X)".
   The client picks GCash or Maya and pays on the same payment page as the deposit, then comes back to the site.
   The word Xendit never shows.
2. When the provider reports it paid (webhook, or the return page asking): a second payment (option Balance) is
   recorded, AmountPaid grows by it, the balance becomes 0 ("Paid in full"). Leyah gets a salon email (her New booking
   alert switch). Reports count it under Paid online on the day it was paid.
3. Recording the balance at the salon is then refused (nothing left).
4. Refunds can now span two online payments: refunded newest first, so a client cancel or no-show (deposit kept)
   refunds only the balance payment; a salon cancel sends the balance back, then the deposit, automatically one after
   the other, shown to Leyah and the client as one refund. If a later part fails, what already went back is kept and
   shown; trying again sends only the rest, and recording it by hand records only the rest.

## Rules (Claude's calls, open to correction)
- Only with the hosted provider (Xendit); with the simulated gateway the button doesn't show.
- Offered only for Confirmed bookings (Leyah has checked the deposit), before the appointment starts, for the
  account's own bookings (never walk-ins).
- The amount is the server's BalanceDue when the page is made; a report for a different amount, or arriving when the
  booking is no longer active or has nothing left to pay, changes nothing and alerts Leyah to refund it by hand.
- A repeated report of the same payment changes nothing.
- An open balance page for the same method is reused; choosing the other method closes it and makes a new one.
- Clients can't pick "Balance" when booking (only Deposit or Full).

## Database
- `payments.refunded_amount` numeric, not null, default 0: how much of each payment has gone back online.
- The new option value "Balance" is stored as text in the existing column (fits its 10 characters); no schema change.

## Non-goals
- Paying part of the balance; paying the balance of a Pending booking; walk-in bookings.
