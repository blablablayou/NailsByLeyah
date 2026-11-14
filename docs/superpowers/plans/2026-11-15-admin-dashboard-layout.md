# Admin Dashboard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-lay the admin dashboard as "action first, two columns" (approach A) without changing any behaviour.

**Architecture:** `DashboardPage.jsx` keeps every component, prop, handler and dialog; only its JSX arrangement and class names change (two columns, no icon tiles, no drawing, no stat tiles). The old `.dash-*` rules in `app.css` (lines ~1510–1627 and ~1947–1962) are replaced by one new block.

**Tech Stack:** React 19 + Vite, plain CSS with the existing tokens, Vitest + Testing Library with the mock backend.

**Spec:** `docs/superpowers/specs/2026-11-15-admin-dashboard-layout-design.md`

## Global Constraints

- No behaviour changes: every list, button, dialog, quick action, the date stepper, links, counts, wording and data stay as today. No API or backend change.
- Heading texts stay exactly: "Dashboard", "Needs your attention", "Next client" / "First client · {date}", "Today’s schedule" / "Schedule · {date}", "Next 7 days" / "7 days after {date}".
- Every accessible name stays (row buttons, "View booking #…", quick actions).
- No other admin page, the admin header or navigation changes.
- Burgundy only on buttons, links and statuses; status colours unchanged.
- Laptop (≥ 1024 px): main column ≈ 2/3, side ≈ 1/3. Below: one column in the order attention, next client, today, balance, next 7 days.

## Review Focus

- An empty attention list (nothing to do) must still read well at the top, not leave a large blank panel.
- No next client (day passed or nothing left today) keeps its existing empty text and "Next: …" line.
- A day with only cancelled bookings still shows "No appointments on this day." plus the cancelled note.
- Long client names, notes and stone lists wrap inside the narrow side column without widening it.
- At 375 px nothing scrolls sideways, and the date stepper stays full width as now.

---

### Task 1: Rearrange the dashboard markup

**Files:**
- Modify: `frontend/src/pages/admin/DashboardPage.jsx`
- Test: `frontend/src/test/adminBookingActions.test.jsx`

**Interfaces:**
- Consumes: the existing components `AttentionCard`, `NextClientCard`, `DayScheduleCard`, `UpcomingCard`, `DateStepper` (props unchanged).
- Produces: page structure `.dash > header.dash-head` then `.dash-layout` with `.dash-main` (attention, today) and `.dash-side` (next client, `.dash-balance`, next 7 days); each section is a `<section class="dash-section">` (no `card` class). New `BalanceLine({ amount, isToday, date })` component rendering `Balance to collect` + the existing "· today and the next 7 days" / "· {date} and the 7 days after" note.

- [ ] **Step 1: Update the tests to the new structure.** In `adminBookingActions.test.jsx` replace every `.closest('.card')` on a dashboard heading with `.closest('section')`. Add:

```jsx
it('puts what needs action first, then the day, with the next client beside them', async () => {
  await openDashboard()
  await screen.findByRole('heading', { name: 'Needs your attention' })
  const main = document.querySelector('.dash-main')
  const side = document.querySelector('.dash-side')
  expect([...main.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Needs your attention', 'Today’s schedule'])
  expect([...side.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Next client', 'Next 7 days'])
  expect(side.querySelector('.dash-balance')).toHaveTextContent(/Balance to collect/)
  expect(screen.getByText(/appointments?$/, { selector: '.dash-count' })).toBeInTheDocument() // today's count beside its heading
  expect(document.querySelector('.dash-tile, .dash-art, .dash-stats')).toBeNull() // no icon tiles, drawing or stat tiles
})
```

- [ ] **Step 2: Run** `npx vitest run src/test/adminBookingActions.test.jsx` — expect the new test to FAIL (no `.dash-main`).
- [ ] **Step 3: Rearrange `DashboardPage`.** Remove the `.dash-stats` block, `PolishArt` and every `dash-tile` / `dash-head-icon` span and `Icon` use except `ChevronIcon` (rows, date stepper) and `CalendarIcon` inside the date stepper. In each card head, the count/countdown that was a `dash-chip` becomes `<span className="dash-count">…</span>` beside the `h2` (attention: "3 items"; next client: the countdown; today: "{n} appointment(s)" from `d.todaysBookingCount`). Empty attention state keeps its text, without the tile. Sections get `className="dash-section"` (next client keeps `dash-next` / `is-empty` modifiers).
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.

### Task 2: New dashboard styles

**Files:**
- Modify: `frontend/src/styles/app.css` (replace the `.dash*` rules; keep `.dash-date*` stepper rules and the status colour rules)

- [ ] **Step 1: Write the new block.** `.dash-layout`: grid, one column, gap 20px; ≥ 1024 px `grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)`, `align-items: start`. `.dash-main`, `.dash-side`: white panel, 1px `--line` border, `--radius`, `--shadow`, sections inside separated by a 1px `--line` hairline, padding 18–20px per section. Phone order via `display: contents` on the columns below 1024 px plus `order` on sections (attention 1, next 2, today 3, balance 4, week 5). Section head: `h2` in the body font, 600, `--fs-lead`, `--ink`; `.dash-count` muted, `--fs-small`. Rows: hairline between, existing chevrons. No gradients, no tile backgrounds.
- [ ] **Step 2: Look** at 1440, 1024, 768 and 375 px (admin signed in, or the test page): order, no sideways scroll, long names wrap in the side column. Run the Impeccable detector on the two changed files: `impeccable.cmd detect --json frontend/src/pages/admin/DashboardPage.jsx frontend/src/styles/app.css`; fix what it flags.
- [ ] **Step 3: Run** `npx vitest run` — expect all pass.
- [ ] **Step 4: Commit** (with your OK): `Admin dashboard: action first, two columns, calmer styling`.
