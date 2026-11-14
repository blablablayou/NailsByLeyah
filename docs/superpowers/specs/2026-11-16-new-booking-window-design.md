# New booking window polish

**Date:** 2026-11-16 · **Size:** small change (one admin window) · **Status:** approved by the user ("Yes, go ahead")

## Why
Leah's "New booking" window (walk-ins, Facebook, Instagram) is one long form of dropdowns: every service and time needs a
list opened, the total only appears at the bottom, half the rows are empty on the right, and fields pop in and out.

## Goals
- Faster to fill in with taps; the money always in view while filling in.
- Calm, familiar controls in the brand (Impeccable "operate" surface): clear selected, hover and focus states.

## Non-goals / anti-goals
- No change to what is asked, validated or saved, the success message, or "confirmed straight away". No backend or DB change.
- No decoration (icon tiles, gradients); colour only for selection and actions.

## Approaches
- **Picked:** same window, wider, with the form on the left and a live summary on the right (bottom on phones); dropdowns
  for service, removal, time and payment become cards and chips; nail art gets − / + steppers.
- Considered: a step-by-step wizard (slower for a quick walk-in, more clicks); restyling the dropdowns only (keeps the
  list-opening work and no live total).

## Design
- **Client:** source chips (Walk-in / Facebook / Instagram), Name and Phone side by side (unchanged fields).
- **Service:** the sets as tappable cards (name, price, time) in price-list order; the removal-only services as chips at the
  end of the section, set apart (built that way: smaller cards wrapped badly); "With design +₱100" tick on a set that has a design version (picks that version); "Removal first" as chips
  (No removal / each removal with price) for a set; Colour stays a dropdown (long list); nail art as rows with − / +.
- **When:** the date picker as now; open times as chips; before a service: "Pick a service to see open times"; none open:
  "No open times this day". Note field unchanged.
- **Payment:** chips Nothing yet / Deposit / Full payment; then Paid by: Cash / GCash / Maya; Reference only for GCash/Maya.
- **Summary (aside):** client and source, service and price, design, removal, nail art lines, date · time; then Total,
  Paid now, Left at the salon. Before a service: "Pick a service to see the total."
- Window: extra-wide on laptops; summary below the form on phones; footer Cancel / Book and confirm unchanged.
