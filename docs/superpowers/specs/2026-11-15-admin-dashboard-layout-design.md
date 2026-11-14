# Admin dashboard layout redesign

**Date:** 2026-11-15 · **Size:** small change (layout and styling of one page) · **Status:** waiting for approval

## Why

The admin dashboard "looks like AI, not that good". It uses the stock generated-dashboard kit: an icon in a coloured
rounded square on every stat and card heading (8 of them), a decorative polish-bottle drawing, count chips, two
big-number stat tiles, and four identical shadowed cards in a symmetric 2 × 2 grid, so nothing leads. Leah uses it on
her phone and laptop about equally, and the first thing she needs is **what needs her action** (`PRODUCT.md`).

## Goals

- What needs action leads the page; then today's schedule; the next client is always in view beside it on a laptop.
- Looks like a calm, practical tool in the Nails by Leyah brand (cream, burgundy), not a template.
- Works one-handed on a phone and comfortably on a laptop.

## Non-goals and anti-goals

- **No behaviour changes:** every list, button, dialog, quick action (confirm, came, no-show, balance, refund), the date
  stepper, links, counts, wording and data stay exactly as they work today. No API or backend change.
- No changes to other admin pages, the admin header or navigation.
- Failure even if it works: anything that looks like a new template (glass cards, gradients, big decorative numbers,
  icon tiles moved somewhere else).

## Approaches

- **A. Action first, two columns (picked).** Wide main column: "Needs your attention", then today's timeline. Narrow side
  column: next client, balance to collect, next 7 days. One column on phones in the same order. Picked because it puts
  action first without merging or removing anything.
- B. One timeline: action items pinned, then everything in time order. Cleaner, but merges the cards, which goes past
  layout-only.
- C. Keep the 2 × 2 grid and restyle. Smallest change, but action keeps equal weight with everything else.

## The design

```
Dashboard                                ‹ Sun, Nov 15 ›
┌─ Needs your attention (3) ────────┐  ┌─ Next client ─────┐
│ Check payment · Ana · GCash ₱150  │  │ 2:00 PM · in 1 hr │
│ Did they come? · Bea · Nov 12     │  │ Ana Cruz · Plain  │
├─ Today · 3 appointments ──────────┤  ├───────────────────┤
│ 11:00  Mia   Plain        Done    │  │ ₱450 to collect   │
│  2:00  Ana   BIAB      Confirmed  │  ├─ Next 7 days ─────┤
└───────────────────────────────────┘  │ Nov 16 · Joy …    │
                                       └───────────────────┘
```

- **Layout:** laptop (≥ 1024 px) two columns, main about two thirds and side about one third. Below that one column:
  attention, next client, today, balance, next 7 days.
- **Stats:** the "Today's appointments" tile becomes the count in the Today heading ("Today · 3 appointments"). "Balance to
  collect" becomes a compact line in the side column, with its "today and the next 7 days" note. Same figures.
- **Headings:** plain text in the body font, semibold, with the count beside them; the page title "Dashboard" keeps the
  display font. No icon tiles, no count chips as pills (counts as plain text), no polish-bottle drawing.
- **Surfaces:** two white panels (main, side) with sections inside split by hairline dividers, instead of a shadowed card
  per section. Rows separated by hairlines; row chevrons stay.
- **Colour:** burgundy only for buttons, links and statuses; status colours unchanged.
- **Empty states:** same wording, plain text (no icon tile).

## Left to the builder

- Exact spacing, type sizes (from the existing tokens), divider and panel details, phone breakpoints in between.
- Keep every existing accessible name and heading text so the tests keep passing (only layout-related test checks may change).

---

## Part 2: what was missing (approved 2026-11-15: "Ok go, but enhance the design")

The two-column layout read as "lacking". Leah needs, at a glance, what's happening, what to do and how she's doing, so the
dashboard gains the following. It still uses only data and dialogs the app already has, with no backend change.

- **Summary bar** under the title, one slim line (not tiles): today's appointments · payments waiting for a check
  (the Check payment items) · deposits received today (`depositsCollectedToday`) · balance to collect. Each figure jumps
  to its section. It replaces the separate balance line.
- **Quick actions** beside the date: "+ New booking" opens the existing `NewBookingDialog` (as on Bookings); "Block time"
  links to Schedule, where blocking is done.
- **This month** in the side column: bookings made, completed, total received (`totalReceived` = deposits + balances)
  from the existing monthly report, with "Reports →".
- **Latest feedback** in the side column: newest rating (stars), comment and client first name, the average rating, with
  "Feedback →". Hidden when there is no feedback yet.
- **Small thin outline icons** beside each section heading, one style, muted (never coloured tiles); calmer empty states.
- **Enhanced look (builder's call within the brand):** refined spacing and type rhythm, the summary bar as the page's one
  confident moment, tabular figures, consistent hover and focus states.

Side column order: next client, this month, next 7 days, latest feedback. Phone order (changed 2026-11-16 so the Tab key
and the screen agree): attention, today, next client, this month, next 7 days, latest feedback (the summary bar stays at
the top).
