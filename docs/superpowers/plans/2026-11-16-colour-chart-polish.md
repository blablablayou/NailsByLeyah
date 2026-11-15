# Colour Chart Polish — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Spec:** `docs/superpowers/specs/2026-11-16-colour-chart-polish-design.md`
**Files:** `frontend/src/lib/shades.js` (`SHADE_FAMILIES`, `FAMILIES`, `shadeMatches(n, query, family)`),
`frontend/src/components/ColorPicker.jsx`, `frontend/src/styles/app.css` ("Colour chart polish" block scoped under
`.cp`), tests in `frontend/src/test/` (new `colourChartPolish.test.jsx`; label updates in `helpers.jsx`,
`colorPicker.test.jsx`, `revisions.test.jsx`).

## Global Constraints
- Same `onChoose` / `onNails` / `onRequest` calls as today; shade radios keep the name `Shade #NN, Name[, out of stock]`.
- Dialog name "Choose Nail Colour"; buttons "Use This Colour", "Use This Choice", "Use These Colours", "Ask Leyah for This Colour".

## Review Focus
- Arrow keys must never colour a nail or change the choice; only Enter/Space/click does.
- A long press must not also fire the click that chooses.
- "Not sure yet" switches off the chart, the search and the families together.
- 375 px: header and Use bar pinned, no sideways scroll, family chips scroll inside their row.
- Faded shades stay choosable (fading is a hint, not a filter).

### Task 1: Tests first
- [ ] `colourChartPolish.test.jsx`: spelling; search "navy"/"30" → 1 of 58 lit; family "Blues" lights blues only and
  combines with search; hover previews without choosing; long press previews without choosing; one Tab stop and
  arrows move focus only; locked right hand explains why; "Other options" label; header holds the compact
  "Selected:" line and the Use bar sits outside the scrolling choices. Update old labels. Run → FAIL.

### Task 2: Build
- [ ] `shades.js` families and matcher; `ColorPickerModal` header/chart/side/use-bar split, search, family chips,
  peek preview, roving focus, per-nail lock note. Run → PASS, suite green.

### Task 3: Styles and look
- [ ] Desktop grid areas, phone sticky header and Use bar, quiet notice, body-font card, states. Check 1440 / 1024 /
  375; detector; suite green.

### Task 4: Review
- [ ] Independent review; fix Critical/Important with tests; ask before commit.
