# New Booking Window Polish — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-11-16-new-booking-window-design.md`

## Global Constraints
- Same fields, validation messages, request body (`api.admin.createBooking`) and success flow; no backend change.
- Controls are real radio groups / buttons with accessible names: service cards `radio` named "<Name> …", time chips
  `radio` "<start> – <end>", payment chips `radio` "Nothing yet" / "Deposit" / "Full payment", method `radio` "Cash"/"GCash"/"Maya",
  steppers `button` "More nails with <add-on>" / "Fewer nails with <add-on>".

## Review Focus
- Switching set or design or removal clears the chosen time (durations change), as the dropdowns did.
- A service without add-ons hides nail art; a removal-only booking hides removal, colour and nail art.
- The summary never shows ₱0 or NaN before a service is picked.
- Keyboard: every chip and card reachable and selectable; focus visible.
- 375 px: no sideways scroll; summary below the form.

### Task 1: Controls, summary, tests
- [ ] Update the two existing flows (adminFeatures.test.jsx, adminBookingActions.test.jsx) to tap cards/chips; add
  "picks service, design, removal and nail art by tapping, with a live total" (Soft Gel Extension + With design + My Work
  removal + Chrome ×2 + Deposit → Total ₱619, Paid now ₱150, Left at the salon ₱469) and "asks for a service before times".
  Run → FAIL.
- [ ] Build in NewBookingDialog.jsx; Modal gains `size="xl"`. Run → PASS, suite green.

### Task 2: Styles and check
- [ ] Styles (`.nb-*`), look at 1440/1024/768/375, detector, suite green, independent review, ask before committing.
