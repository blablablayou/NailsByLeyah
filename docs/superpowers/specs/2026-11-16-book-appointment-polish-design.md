# Book an appointment: polish of steps 1–3

**Date:** 2026-11-16 · **Size:** a project (one page, three steps, shared panel) · **Status:** approved ("Yes, polish it" + A, B, C)
**Branch:** `client-booking-redesign` (from main 00ca495). No commit or push without the user's OK.

## Why
The client booking page works but reads as assembled: four heading styles (small uppercase labels with rules, display
headings, plain bold, display again in the total panel), varied spacing and cards, a long step 1 full of greyed photos for
options that don't apply, a stretched empty "Your appointment" block on step 2, and misaligned columns on step 3.

## Goals
- One visual system across the three steps and the "Your total" panel, calm and in the brand.
- A noticeably shorter step 1; no dead space on steps 2 and 3.
- Phone-friendly: the total and "Next" always reachable.

## Non-goals / anti-goals
- **No function removed or changed:** services, design, removal, colour chart, nail art (hands, counts), design photos,
  note and quick-adds, calendar, time slots, draft save/restore and "Start over", payment step (as just approved), totals,
  validation, server checks. No backend or database change.
- No decoration (eyebrow labels, icon tiles, gradients); no new marketing copy.

## Approaches
- **Picked:** polish in place: keep the three-step wizard and the side panel, unify headings and surfaces, fold
  unavailable options into one line, tighten grids, plus three small navigation additions (A, B, C).
- Considered: merging steps into one long page (fewer clicks but a much bigger change, and the draft logic is per step);
  restyling only (leaves step 1's dead space and the phone "Next" problem).

## Design
1. **Headings:** each section a single heading (body font, semibold) with short helper text; no uppercase labels with
   rules. The page title keeps the display font. One card style and one spacing rhythm.
2. **Step 1:** options that don't apply (design, nail art for Plain) collapse into one short line saying why and what to
   pick instead; nail art in a tighter grid with smaller photos; design-photo slots smaller.
3. **Step 2:** "Your appointment" sized to its content; larger, clearer time buttons (still grouped Morning / Afternoon /
   Evening); note and quick-adds unchanged.
4. **Step 3:** appointment and services in one summary card, booking policy compact, columns aligned; payment column as is.
5. **Your total:** lighter (no heavy display "Total" box), aligned figures, no wrapping labels.
6. **Additions:**
   - **A. Clickable steps:** finished steps in the step bar are buttons that go back to that step; the current and later
     steps are not clickable (nothing can be skipped).
   - **B. Phone sticky bar:** below the panel breakpoint, a slim bar fixed to the bottom with the total and the step's
     Next / Pay-step button, so it is always reachable.
   - **C. Edit links in the total panel:** "Colour" and "Appointment" link to the step and section where they are chosen
     (as the user chose option C; the service lines keep the existing "Change services" on step 3 and "← Back to…").
