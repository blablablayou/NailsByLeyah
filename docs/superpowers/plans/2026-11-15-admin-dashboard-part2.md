# Admin Dashboard Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the summary bar, quick actions, This month, Latest feedback and heading icons, and refine the look.

**Spec:** `docs/superpowers/specs/2026-11-15-admin-dashboard-layout-design.md` (Part 2)

## Global Constraints
- No backend or API change; reuse `api.admin.monthlyReport(year, month)`, `api.admin.feedback({ page: 1, pageSize: 1 })`, `NewBookingDialog`, `totalReceived`, `Stars`.
- Existing behaviour, headings and accessible names unchanged; the part-1 test stays green (its side-column heading list grows).
- Figures in the summary bar equal the existing ones (today count, Check payment items, `depositsCollectedToday`, balance to collect).

## Review Focus
- Monthly report or feedback failing to load must not break the dashboard (the section shows a quiet line).
- No feedback yet: the Latest feedback section is hidden.
- A long feedback comment is clipped to a few lines, not stretching the side column.
- Summary bar wraps cleanly at 375 px.
- New booking from the dashboard refreshes the dashboard and shows the same success message as Bookings.

### Task 1: Summary bar, quick actions, icons
- [ ] Tests (adminBookingActions.test.jsx): summary bar shows the four figures with labels; "+ New booking" opens the "New booking" dialog; "Block time" links to `/admin/schedule`; every section heading has an `aria-hidden` icon. Run → FAIL.
- [ ] Build in DashboardPage.jsx: `SummaryBar({ todayCount, checkCount, depositsToday, balance, isToday })`, actions in the header, `SectionIcon` per heading; remove `BalanceLine`. Run → PASS, full suite green.

### Task 2: This month and Latest feedback
- [ ] Tests: This month shows "made", "completed" and total received from the mock report, link to `/admin/reports`; Latest feedback shows the newest comment and its client's first name, link to `/admin/feedback`; hidden with no feedback; a failing report shows a quiet line. Run → FAIL.
- [ ] Build `MonthCard()` and `FeedbackCard()` (each with its own `useAsync`), placed in the side column. Run → PASS, suite green.

### Task 3: Enhanced styling and check
- [ ] Styles for the summary bar, actions, icons, month and feedback cards; refine rhythm. Look at 1440/1024/768/375; detector; suite green; ask before committing.
