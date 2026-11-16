# Client ratings on the home page (Phase C, part 1) — design

Approved by the user on 2026-11-17 ("Oo, simulan"), including the one database change. Small change.

## Why
Clients already rate the salon (1-5 stars, optional comment) and Leyah reads and replies on the admin Feedback page,
but a new visitor never sees any of it. A few real comments on the home page help someone deciding whether to book.

## Goals
1. Leyah chooses: each feedback with a comment gets a "Show on home page" switch on the admin Feedback page. At most
   6 are shown at a time; nothing appears on its own.
2. Home page section "What clients say" between Our Works and Meet Leyah: the average of all ratings and how many,
   then the chosen comments (stars, comment, "Kyla S." = first name + last initial, month and year). Hidden when none
   is chosen.
3. The client's Feedback form says, before they send: "Leyah may show your comment on the home page with your first
   name and last initial."

## Rules (Claude's calls, open to correction)
- Only feedback with a comment can be shown; a 7th is refused with a clear message (turn one off first).
- A deleted client's feedback is never shown, even if it was switched on.
- The average counts every rating, not only the chosen ones; it is shown only when there is at least one rating.
- Newest chosen first.

## Database
- `feedback.show_on_home` boolean, not null, default false. Nothing existing changes; no data lost.

## Non-goals
- No photos or full names on the home page; clients can't pick it themselves; no auto-picking by stars.
