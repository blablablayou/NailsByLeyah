# Book an Appointment Polish — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-11-16-book-appointment-polish-design.md`
**Files:** `frontend/src/pages/client/BookPage.jsx`, `frontend/src/components/SlotPicker.jsx` (step 2 layout only),
`frontend/src/styles/app.css` (a new "Booking polish" block at the end, scoped under `.book`, overriding the scattered
older rules; dead rules it replaces are removed where safe), tests in `frontend/src/test/`.

## Global Constraints
- No function removed or changed; same request to `api.bookings.create`, same draft saving, same validation messages.
- Keep accessible names the tests use: service/design/add-on checkboxes, "Back to …", "Next: …", "More nails for …",
  "Your total" panel with "Total" followed by its amount (`getByText('Total').nextSibling`).
- The phone bar's total must not add a second exact "Total" text (it says "total", lower case, and is hidden on desktop).

## Review Focus
- Folding unavailable options must not hide anything the client can still choose (design photos stay; colour section
  stays with its line).
- Clickable steps never allow skipping ahead; the current and later steps stay plain text.
- "Change appointment" from step 1 goes forward only through the normal Next checks.
- Draft restore still lands on the saved step; Start over still works.
- 375 px: no sideways scroll; the fixed bar never covers the last control (page gets bottom room).

### Task 1: Behaviour (tests first)
- [ ] Tests: (A) "goes back to a finished step from the step bar, never forward"; (B) "the phone bar shows the total with
  Next"; (C) "jumps from Your total to the colour or the appointment"; folded options: "folds design and nail art into a
  line when they don't apply" (update the two Plain tests in bookingAndFeedback/revisions to expect the line and no
  disabled cards). Run → FAIL.
- [ ] Build in BookPage.jsx. Run → PASS, suite green.

### Task 2: Styles
- [ ] `.book` polish block: one heading system, cards, tighter nail-art grid, smaller photo slots, step 2 appointment
  box to content, larger time buttons, step 3 aligned columns, lighter Your total, phone bar total, bottom room on phones.
- [ ] Look at 1440 / 1024 / 768 / 375 on all three steps; detector; suite green.

### Task 3: Review
- [ ] Independent review; fix Critical/Important with tests; ask before commit.
