# Colour chart window: polish

**Date:** 2026-11-16 · **Size:** one component (`ColorPickerModal`) · **Status:** approved ("Yes, polish it", "Colour", A + B + C)
**Branch:** `client-booking-redesign`. No commit or push without the user's OK. No backend or database change.

## Why
The window works but on a phone the title, the choice and "Use This Color" sit about 2,000 px down, under the whole
chart. The right side mixes three heading styles, a loud yellow warning box and unlabelled chips; the per-nail part
doesn't say why the right hand is locked; the shade grid is 58 Tab stops; and there is no way to find a shade by name.

## Non-goals
- No function removed or changed: shade choice, clear, per-nail colours (left hand first), "Not sure yet", "Can't find
  your colour?" with its box, out-of-stock shades, nothing saved until the Use button, Escape/close keep the old choice.
- The chart keeps its printed look and its number order (it matches Leyah's real chart); families and search only
  light up matches, they never reorder or hide shades.

## Design
1. **Layout:** a header (title, close, on phones a compact "Selected:" line), the chart, the choices, and a Use bar.
   Desktop: chart left; header, choices and Use bar right. Phones: header pinned at the top, Use bar pinned at the
   bottom, the chart and choices scroll between them.
2. **Right side:** the screen-colour warning is one quiet line; the selected card in the body font; an "Other options"
   label over the chips; the display font only on the window title.
3. **Per nail:** the locked right hand says "Opens after all 5 left nails"; the target nail is marked and the hint
   ("Now tap a shade for your left thumb") shows on phones too.
4. **Chart states:** clearer hover (lift and ring), selected (burgundy ring and tick), out of stock (as now), and faded
   for shades outside a search or family.
5. **Keyboard:** the grid is one Tab stop; arrow keys, Home and End move between shades (focus only); Enter or Space
   chooses, so a nail is never coloured by just moving.
6. **Spelling:** "Choose Nail Colour", "Selected Colour", "Use This Colour", "No colour selected yet."

## Additions
- **A. Find a shade** and **B. Colour families** were built, then removed at the user's request ("not accurate").
- **C. Quick compare:** hovering a shade with a mouse, focusing it, or pressing and holding it on a touch screen shows it
  in the preview ("Previewing") without choosing it; letting go goes back to the chosen shade. A long press never
  chooses.
