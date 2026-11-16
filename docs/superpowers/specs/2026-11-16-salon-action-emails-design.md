# Client emails for what the salon does (Phase A) — design

Approved by the user on 2026-11-16 ("Oo, simulan ang Phase A"). Small change.

## Why
Today a client hears nothing when Leyah cancels or moves their appointment, or when their refund goes out; they only
find out by signing in. The salon already gets an email for everything the client does, so this closes the other side.
For the defense (Nov 26) and kept complete for go-live.

## Goals
1. Leyah cancels a booking -> the client gets "Your Nails by Leyah appointment was cancelled": service, date, time, the
   reason (and Leyah's explanation if she wrote one), and what happens to the money (amount coming back, or the deposit
   is kept and nothing comes back).
2. Leyah moves a booking -> "Your appointment was moved": the old and the new date and time.
3. A refund is actually sent -> "Your refund was sent": amount, and the reference when there is one.
   - Sent by hand: when Leyah records it.
   - Sent online: when it is Succeeded (not while Processing), however the success arrives (the answer, the
     notification, or Check again).

## Non-goals / anti-goals
- No email to a client for what they did themselves (their own cancel or reschedule): unchanged.
- No HTML emails, no SMS, no new settings, no database change.
- Never name Xendit in an email; say GCash or Maya.
- A failed email never fails Leyah's action (same background queue as today).

## Approaches
- **Chosen:** three plain-text emails in `EmailNotificationService`, sent through the existing background queue —
  same look and delivery as every current email.
- HTML emails with brand colours: nicer, but unlike every other email and much more work. Not now.
- SMS: costs money and needs another provider. Not now.

## Calls made by Claude (open to correction)
- Walk-ins without an account get no email (no address).
- An email is queued only after the change is saved, so nothing is announced that didn't happen.
- The refund email says "sent back to your GCash/Maya" for an online refund and "sent by GCash or Maya" for one sent by hand.
