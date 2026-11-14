# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Design skills used while building: **impeccable** (craft floor before every UI edit, `polish` and `audit` at the end, the detector once at the end) and **ui-ux-pro-max** (pre-delivery checklist, accessibility rules).

**Goal:** Rebuild the NailsByLeyah landing page into five clear sections — Hero, Services & Pricing, Our Works, Meet Leyah, Visit Us — in the existing brand, without touching booking, sign-in, admin or the database.

**Architecture:** Modify the existing React landing components in `frontend/src/pages/client/home/` and the page that assembles them (`HomePage.jsx`); keep live data where it already comes from (the price list from `/api/services`, gallery uploads from `/api/gallery`, phone, bio and photo from Leah's salon profile, hours from the schedule). Styling stays in `frontend/src/styles/home.css` on the existing brand tokens in `app.css`.

**Tech Stack:** React 19 + Vite, plain CSS with the existing tokens, Vitest + Testing Library with the mock backend. Backend (C# ASP.NET Core) and Supabase are untouched unless decision D6 chooses option B.

**Spec:** `docs/superpowers/specs/2026-11-14-landing-page-brief.md` (the brief) plus the five reference images shared on 2026-11-14 (described in each phase).

---

## How to use this plan

- **Phases run in order.** Phase 0 is only decisions; nothing is built until every decision it lists says **Agreed**.
- **Decisions** are numbered **D1, D2…**. Each has options and a recommendation. I ask them one phase at a time and write the answer into the **Decision log** below. A phase doesn't start while one of its decisions is still **Waiting**.
- **Checkpoints** close every phase: the tests pass, the page was checked in the browser at 375, 768, 1024 and 1440 px wide, the work is committed, and the checkpoint line gets the date and commit. **To resume after a break, find the first checkpoint without a date and continue from that phase.**
- **Database and Supabase: ask first, always.** Any change to the database or to Supabase (new or changed tables or columns, migrations, data edits, Storage buckets or settings) needs your explicit permission before it is made, even when a decision already points that way. Every phase says whether it touches the database; only D6 option B does, everything else is website code only.
- **Branch: `landing-page-redesign`.** All landing page work is committed on this branch, made from `client-revisions` at 117c2fb on 2026-11-14. **It is never merged into `main`** (or `client-revisions`) as part of this plan; merging happens only if and when you say so. Pushing the branch to GitHub also waits for your OK.
- **Commits and pushes** only with your OK, as usual.

## Decision log

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D1 | Stay on React, or rebuild the landing page in Blazor (the brief says Blazor) | **Stay on React** | ✅ Agreed (2026-11-14): React |
| D2 | Final order of sections, and what happens to Intro, Up Close, Nail Rules, FAQ | Intro → Hero → Services → Our Works → Meet Leyah → Nail Rules → FAQ → Visit Us | ✅ Agreed (2026-11-14): Intro, Nail Rules and FAQ stay; **Up Close dropped**; order **Intro → Hero → Services & Pricing → Our Works → Meet Leyah → Nail Rules → FAQ → Visit Us** |
| D3 | Header: centred logo with links split left and right (reference) — on every page, or the landing page only | **Every page**, same links | ✅ Agreed (2026-11-14): **every page** |
| D4 | Hero photo | A real photo of Leah's work on a light background; placeholder until supplied | ⏳ Waiting |
| D5 | Hero headline | Brief's *Beautiful Nails, Beautiful You.* (reference shows *Let's be nail friends*) | ⏳ Waiting |
| D6 | Service descriptions: written in the website code (A), or editable by Leah in admin (B, database change) | **A** | ⏳ Waiting |
| D7 | Service cards: photo on each card (brief) or small icons (reference) | **Small icons** | ⏳ Waiting |
| D8 | "View Full Gallery": new public `/gallery` page (none exists today) or expand in place | **New `/gallery` page** | ⏳ Waiting |
| D9 | Meet Leyah content: Leah's profile bio and photo (editable today) with a marked placeholder until she writes it | **Profile bio and photo** | ⏳ Waiting |
| D10 | Visit Us: heading text, and whether the phone and hours show as listed rows (reference "Get in Touch") | "Visit Us", rows with icons, no booking button | ⏳ Waiting |
| D12 | Small uppercase label above section titles ("GALLERY", "SERVICES", "CONTACT", as in the references). Impeccable's craft floor bans these labels; the references use them | Leave them out (the title carries the section), or keep them to match the references | ⏳ Waiting (raised in Phase 1; `SectionHeading` supports both) |
| D11 | Motion: the opening letter animation, the typing headline, and how sections appear | Keep the opening animation; headline appears whole (no typing) so the D5 headline reads at once; sections fade in once; nothing moves with reduced motion | ✅ Agreed (2026-11-14): the **opening animation stays**; the headline **shows whole** (no typing); sections **fade in once** on scroll (12 px), off with reduced motion |

## Global Constraints

- Palette (already the site's tokens in `frontend/src/styles/app.css`): Cream White `#FFF8F4` (`--cream`), Blush Pink `#F0D5DC` (`--blush`), Dusty Rose `#C98497` (`--dusty-rose`), Burgundy `#682C43` (`--burgundy`), Charcoal `#30252A` (`--ink`). No new colours outside these and their existing tints.
- Fonts stay: Playfair Display for headings (`--font-display`), Inter for text (`--font`).
- Prices only from the live price list (`/api/services`): never typed into the page. "With design" shows the design version's own price (₱350 BIAB, ₱499 Soft Gel Extension today). Plain has no design.
- The hero button goes where it goes today: `/book` when signed in, `/register` for guests (`bookTo` in `HomePage.jsx`).
- No new frontend framework or library (no Tailwind, no GSAP); CSS transitions only.
- Text 4.5:1 contrast or better; visible focus on every link and button; touch targets at least 44 × 44 px; `prefers-reduced-motion` removes movement.
- Every image has `width`/`height` (no layout shift) and `loading="lazy"` below the first screen; every meaningful image has alt text, decorative ones `alt=""`.
- No horizontal scroll at 320 px and up.
- Not touched: sign-in, sign-up, booking flow, payments, admin pages, the backend and the database (except D6 option B, and only after your permission).
- Kept as they are, by your decision: the opening animation (`Intro`), Nail Rules (`RulesSection`) and FAQ (`FaqSection`). They may get spacing and type touch-ups in Phase 7 to match the new sections, but nothing removed.
- No database or Supabase change of any kind without asking first.
- Placeholder content is labelled as placeholder on the page until real content replaces it; no invented founding year, phone number or hours.

## Review Focus

- **No gallery uploads yet, or fewer than nine:** the 3 × 3 grid fills from the built-in photos first, then uploads; it never shows empty tiles. Test in Phase 4.
- **Price list didn't load** (API down or slow): the five cards still render with names and descriptions and say "See prices when booking" instead of ₱0 or blank. Test in Phase 3.
- **A service turned off in admin** (e.g. Soft Gel Extension inactive): its card disappears and the remaining cards stay centred. Test in Phase 3.
- **Leah hasn't written a bio or added a photo:** Meet Leyah shows the labelled placeholder text and a neutral studio placeholder, never an empty box. Test in Phase 5.
- **No map key (`VITE_GOOGLE_MAPS_API_KEY` empty):** the keyless map embed still loads and Open in Maps still opens the right place. Test in Phase 6.

---

## Phase 0 — Decisions (nothing is built)

**Database:** none.

Ask D1–D11 with the options below, a few at a time, and record each answer in the Decision log.

- **D1 — React or Blazor. ✅ Agreed: React.**
- **D2 — Section order and existing sections.** Today: Intro (letter animation) → Hero → Up Close tour → Our Works → Pricing → Nail Rules → FAQ → Find Us. **Agreed: Intro, Nail Rules and FAQ stay.** Still to decide: (a) **Up Close** — keep (it shows close-ups of each set) or drop (the 3 × 3 gallery now shows the work); recommended drop; (b) the order — recommended Intro → Hero → Services & Pricing → Our Works → Meet Leyah → Nail Rules → FAQ → Visit Us (people read the rules and questions before they come, and Visit Us closes the page next to the footer).
- **D3 — Header.** Reference: links on the left (Book now, Services, Gallery), logo in the centre, links on the right (About, Sign in, Sign up). The header is shared by every page. Recommended: same header everywhere, signed-in users see My bookings and their name instead of Sign in / Sign up, phone keeps the menu button.
- **D4 — Hero photo.** The reference is a styled stock-like image (hand on white, polish bottle). The brief says use existing photos; the existing ones are close-ups on dark backgrounds. Options: (A) Leah supplies one bright photo of her own work, placeholder from `closeup-*.jpg` until then; (B) use an existing close-up as is; (C) a stock photo (must be licensed and not pretend to be Leah's work). Recommended **A**.
- **D5 — Headline.** Brief: *Beautiful Nails, Beautiful You.* Reference: *Let's be nail friends* with *Your next favourite set starts here. Soft gel, BIAB & nail art, made for you.* Pick one; supporting text follows the choice.
- **D6 — Service descriptions.** The services have no description in the database. (A) Short descriptions written in `frontend/src/content/salon.js`, keyed by service name (website change only). (B) A `description` column on services, editable on admin Services (**database change: new column, no data lost**, one migration, backend tests). Recommended **A**: they rarely change.
- **D7 — Card visual.** Brief: a photo on each card. Reference: a small round icon. Recommended icons (cleaner, five cards stay equal, and the gallery already carries the photos); option: photos from `service-*.jpg` and `addon-*.jpg`.
- **D8 — Full gallery.** No public gallery page exists. Recommended a new route `/gallery`: every photo (built-in plus Leah's uploads), same viewer, back link to home. Option: "View all" expands the grid on the landing page.
- **D9 — Meet Leyah.** Leah's salon profile already stores a bio and a photo (admin → Salon settings) and the landing page shows them in a small card today. Recommended: the new section reads that bio and photo, and until she writes one shows the brief's sample text labelled "Sample story · details to be confirmed" (as in the reference). Studio photo: Leah supplies one; neutral placeholder until then.
- **D10 — Visit Us.** Heading "Visit Us" (brief) or "Get in Touch" (reference). Rows with small icons: Opening hours, Location, Phone (only when Leah has set one), then "Open in Maps"; map on the right; the booking button removed (brief). Meet Leyah gets its own section (D9), so it's not repeated here.
- **D11 — Motion.** **Agreed: the opening letter animation stays.** Still to decide: (a) the **typing headline** — keep it typing, or show the new headline whole right after the opening animation (recommended, so the D5 headline is read at once); (b) sections fade in once as you scroll (opacity and 12 px), nothing moves with reduced motion — recommended yes.

### ✅ Checkpoint 0 — decisions agreed
- [ ] Every row of the Decision log says **Agreed** with the chosen option.
- [ ] Date / note: ______

---

## Phase 1 — Shared section frame and header

**Database:** none. **Needs:** D2, D3, D11 — **all agreed (2026-11-14); this phase can start.** Includes the once-only section fade-in (D11b) through the existing `canAnimate` helper in `home/motion.js`, so reduced motion and tests keep sections fully visible.

**Files:**
- Modify: `frontend/src/components/Layout.jsx` (header: centred logo, links split)
- Modify: `frontend/src/styles/app.css` (header rules), `frontend/src/styles/home.css` (section frame)
- Modify: `frontend/src/pages/client/HomePage.jsx` (section order per D2; `Intro`, `RulesSection` and `FaqSection` stay; `CloseupTour` removed per D2)
- Create: `frontend/src/pages/client/home/SectionHeading.jsx`
- Test: `frontend/src/test/home.test.jsx`, `frontend/src/test/adminNav.test.jsx` (header still works for admin)

**Interfaces:**
- Produces: `SectionHeading({ eyebrow: string, title: string, intro?: string, id: string })` — renders the small uppercase eyebrow, an `<h2 id={id}>`, and an optional intro line, centred. Every later phase uses it.
- Produces: section order in `HomePage.jsx` with ids `hero`, `services`, `gallery`, `about`, `rules`, `faq`, `visit` (or the order D2 settles; add `tour` if Up Close stays). Header links and `scrollToSection` use these.

- [ ] **Step 1: Write the failing tests** in `home.test.jsx`: `it('shows the sections in the agreed order')` — collects `section[id]` and expects the D2 order, e.g. `['hero','services','gallery','about','rules','faq','visit']`; `it('still plays the opening animation')` — the intro element renders on first visit (as the current test setup allows); `it('header links go to Services, Gallery and About')` — links named Services, Gallery, About have `href` `/#services`, `/#gallery` (or `/gallery` per D8), `/#about`.
- [ ] **Step 2: Run** `npx vitest run src/test/home.test.jsx` — expect FAIL (old ids and order).
- [ ] **Step 3: Implement** the header (logo centred above 1024 px; phone keeps the menu button), `SectionHeading`, and the new order in `HomePage.jsx`. Update the existing test that checks "Explore and Pricing" links to the new names.
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at `/`, `/login`, `/book` and `/admin` at 375, 768, 1024, 1440 px: header aligned, no overlap, menu works on phone, focus visible.
- [ ] **Step 6: Commit** (with your OK): `Landing page: new header and section order`.

### ✅ Checkpoint 1 — header and section frame
- [x] Tests pass (185/185) · checked at 375, 768, 1024, 1440 px (signed in as a client: `/`, `/book`, `/bookings`, `/profile`; the guest header is covered by tests) · committed: waiting for your OK
- [x] Date: 2026-11-14 · commit: ______

**What Phase 1 actually did:** new header on every client/guest page (Book now, Services, Gallery left of the centred logo; account links right; phone menu unchanged); the admin header is not changed (it has its own menu). Up Close removed (`CloseupTour.jsx` and its styles). Section ids now `hero, services, gallery, rules, faq, visit` (`about` arrives with Meet Leyah in Phase 5, together with an **About** link in the header). `SectionHeading` used by Pricing, Nail Rules and FAQ; section headings fade in once with a 12 px rise. The hero's second button now goes to Our Works. Added on your request (2026-11-14): **Log in and Sign up are plain uppercase links** like the left side, without the pill buttons or the divider (old pill styles removed). Then: a **Contact** link (→ Visit Us), the header says **Sign in** (the login page itself still says "Log in"), and the right side reads **Contact · Sign up · Sign in**, with **Sign up as the filled burgundy call to action**. Final (your request): **Sign up removed from the header**; the right side is **Contact · Sign in**, with **Sign in as the call to action** (filled burgundy rectangle, 8 px rounded corners); every header link uses the same type (13.76 px, weight 500, uppercase, .12em). Guests sign up through Book now, the hero button and "Create an account" on the sign-in page. Then (your request): the header logo is a **text-only SVG wordmark** (`components/BrandLogo.jsx`: "Nails by Leyah" in Great Vibes, self-hosted via `@fontsource/great-vibes` 5.3.0, over "NAIL STUDIO" in Inter, burgundy) on every page including admin; the opening animation and the price card still use the old logo image. **About** added, so the right side is **About · Contact · Sign in**; About points to `#about`, which starts working when Meet Leyah is built in Phase 5. **About and Contact now light up** while their section is on screen, like Services and Gallery (Contact checked in the browser; About will once its section exists).

---

## Phase 2 — Hero

**Database:** none. **Needs:** D4, D5, D11. **Reference:** white card on soft pink, headline and outlined *Book an Appointment* left, hand photo right, a pink polish "stream" curving behind.

**Files:**
- Modify: `frontend/src/pages/client/home/Hero.jsx`, `frontend/src/styles/home.css`
- Add (if D4 = A, when supplied): `frontend/public/img/hero.jpg` (and `.webp` if converted)
- Test: `frontend/src/test/home.test.jsx`

**Interfaces:**
- Consumes: `bookTo` from `HomePage.jsx` (unchanged).
- Produces: `Hero({ bookTo: string, revealAfter: number })` — `revealAfter` (ms) replaces `typingStartsAfter`: the opening animation stays, and the whole headline appears once it ends (D11a: no typing). `deposit` and `onJump` go away if the new hero no longer shows them.

- [ ] **Step 1: Write the failing test** `it('hero has the headline, the text and Book an Appointment')`: `getByRole('heading', { level: 1, name: <D5 headline> })`; `getByRole('link', { name: 'Book an Appointment' })` has `href` `/register` for a guest and `/book` after `signIn(CLIENT)`; `getByRole('img', { name: /nails by leyah/i })` in the hero has `width` and `height`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** two columns (text 5/12, photo 7/12 above 1024 px; stacked with text first below 768 px); the curve is one inline SVG path in blush/dusty-rose behind the photo, `aria-hidden`, under 12% of the hero's visual weight; photo `object-fit: contain` so nails are never cropped.
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at 4 widths: headline and button above the fold on a 375 × 667 phone; no horizontal scroll; button focus ring visible.
- [ ] **Step 6: Commit** (with your OK): `Landing page: new hero`.

### ✅ Checkpoint 2 — hero
- [ ] Tests pass · checked at 4 widths · committed
- [ ] Date / commit: ______

---

## Phase 3 — Services & Pricing (five cards)

**Database:** none with D6 = A; **one new column with D6 = B** (tell first, migration `ServiceDescriptions`, backend tests in Visual Studio). **Needs:** D6, D7. **Reference:** five white cards (3 + 2 centred), each with a round icon, name, one-line description, big burgundy price, a small line under it ("Plain colour only", "With design · ₱350", "From ₱10 / nail", "My work · ₱100 / Not my work · ₱150"); under them *View full price list* (outlined) and *Book now* (filled).

**Files:**
- Modify: `frontend/src/pages/client/home/PricingSection.jsx` (cards; keep the existing unfolding full price card behind *View full price list*)
- Modify: `frontend/src/content/salon.js` (D6 = A: `serviceBlurbs` keyed by service name)
- Modify: `frontend/src/lib/services.js` only if a helper is needed for the add-on minimum
- Test: `frontend/src/test/home.test.jsx`

**Interfaces:**
- Consumes: `catalog` from `/api/services` via `HomePage.jsx`; `softGelSets(services)` from `lib/services.js` (returns `{ base, design }` per set).
- Produces: `ServiceCard({ icon, name, blurb, price: number | null, note: ReactNode })`; `price === null` shows "See prices when booking".

- [ ] **Step 1: Write the failing tests:**
  - `it('shows five service cards: Plain, BIAB, Soft Gel Extension, Nail Design Add-ons, Removal')` — card headings in that order.
  - `it('takes every price from the live price list')` — Plain ₱300 "Plain colour only"; BIAB ₱250 "With design · ₱350"; Soft Gel Extension ₱399 "With design · ₱499"; Add-ons "From ₱10 / nail"; Removal "My work · ₱100", "Not my work · ₱150".
  - `it('drops a service that Leah turned off')` — mark Soft Gel Extension inactive in the mock db; four cards, no Soft Gel Extension.
  - `it('still shows the cards when the price list fails to load')` — make `/services` reject; five cards, each "See prices when booking", no "₱0".
  - `it('shows how long each set takes')` — Plain "2 hr", BIAB "3 hr", Soft Gel Extension "2 hr" from `durationMinutes` (the brief's optional duration; no time on Add-ons).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the cards (CSS grid of 6 columns: row 1 cards span 2, row 2 cards span 2 starting at column 2 so they centre; tablet 2 columns; phone 1), equal heights, icons as inline SVG with `aria-hidden`, hover lifts 2 px only without reduced motion.
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at 4 widths; open *View full price list* and confirm it still shows +₱100 for designs.
- [ ] **Step 6: Commit** (with your OK): `Landing page: five service cards from the live price list`.

### ✅ Checkpoint 3 — services & pricing
- [ ] Tests pass · checked at 4 widths · committed (and backend tests passed if D6 = B)
- [ ] Date / commit: ______

---

## Phase 4 — Our Works (3 × 3) and the full gallery

**Database:** none. **Needs:** D8. **Reference:** "GALLERY" eyebrow, *Our Works*, *Soft gel, BIAB and nail art, crafted by Leyah.*, nine square photos with rounded corners, *View full gallery →* underneath.

**Files:**
- Modify: `frontend/src/pages/client/home/WorksGallery.jsx` (grid of nine; keep `PhotoViewer`)
- Create (D8 = new page): `frontend/src/pages/client/GalleryPage.jsx`; Modify: `frontend/src/App.jsx` (route `gallery`)
- Test: `frontend/src/test/home.test.jsx`

**Interfaces:**
- Consumes: `api.gallery.list()` and `galleryPhotoSrc(photo)` (existing); `PhotoViewer({ photo, open, onClose })` (existing).
- Produces: `galleryPhotos(uploads): Array<{ key, src, alt }>` exported from `WorksGallery.jsx` — Leah's uploads first (newest first), then the built-in photos; the landing page takes the first nine, `/gallery` shows all.

- [ ] **Step 1: Write the failing tests:**
  - `it('shows nine works and a link to the full gallery')` — nine buttons named like "View photo …" in `#gallery`; link *View full gallery* `href` `/gallery`.
  - `it('fills the grid from built-in photos when Leah has uploaded fewer than nine')` — mock gallery returns 2 uploads; still nine tiles; the first two are the uploads.
  - `it('opens a photo larger and closes it with Escape')` — click a tile, dialog visible, Escape closes, focus returns to the tile.
  - `it('the full gallery page lists every photo')` — `renderApp('/gallery')`, tile count = uploads + built-in.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**: grid 3 / 2 / 2 columns (≥1024, ≥560, below), `aspect-ratio: 1` with `object-fit: cover`, 12 px gaps, `loading="lazy"`; `/gallery` page reuses the tile and the viewer, page title "Our Works", back link "← Back to home".
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at 4 widths; keyboard: Tab reaches each tile, Enter opens, Escape closes.
- [ ] **Step 6: Commit** (with your OK): `Landing page: 3 by 3 works and a full gallery page`.

### ✅ Checkpoint 4 — our works
- [ ] Tests pass · checked at 4 widths · committed
- [ ] Date / commit: ______

---

## Phase 5 — Meet Leyah

**Database:** none (reads Leah's existing profile bio and photo). **Needs:** D9. **Reference:** a cream card on the left — "ABOUT THE OWNER", big *MEET LEYAH*, "SAMPLE STORY · DETAILS TO BE CONFIRMED", three short first-person paragraphs, an italic burgundy sign-off (*Nails that match your vibe.*); a rounded studio photo on the right.

**Files:**
- Create: `frontend/src/pages/client/home/MeetLeyah.jsx`
- Modify: `frontend/src/pages/client/home/InfoCards.jsx` (remove the small Meet Leyah card from Visit Us)
- Modify: `frontend/src/content/salon.js` (`sampleStory`: the brief's sample bio, as paragraphs)
- Test: `frontend/src/test/home.test.jsx`

**Interfaces:**
- Consumes: `useSalon()` → `{ bio: string | null, photo: string | null }` (existing).
- Produces: `MeetLeyah()` section with `id="about"`.

- [ ] **Step 1: Write the failing tests:**
  - `it('shows Leah's own story when her profile has one')` — mock salon settings with a bio; the text shows; no "Sample story" label.
  - `it('shows the labelled sample story until Leah writes hers')` — no bio; text includes "Hi, I'm Leyah"; label "Sample story · details to be confirmed" visible; no year like `/20\d\d/` in the sample.
  - `it('shows a placeholder studio photo until Leah adds one')` — no photo; an element with accessible name "Studio photo coming soon".
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** two columns (text 6/12, photo 6/12; stacked text-first on phone), paragraphs at most 70 characters per line, bio split on blank lines into paragraphs.
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at 4 widths, with and without a bio (set and clear it in admin → Salon settings).
- [ ] **Step 6: Commit** (with your OK): `Landing page: Meet Leyah section`.

### ✅ Checkpoint 5 — meet leyah
- [ ] Tests pass · checked at 4 widths · committed
- [ ] Date / commit: ______

---

## Phase 6 — Visit Us

**Database:** none. **Needs:** D10. **Reference:** cream background, "CONTACT" eyebrow, *Get in Touch*, three rows with round icons (Opening Hours *Open daily · 11:00 AM – 9:00 PM*, Location *201 Mabuhay Compound, Sauyo Road, Quezon City*, Phone *0948 647 5103*), one line of text, *Open in Maps ↗*; a rounded map on the right. (The reference still has a booking button; the brief removes it.)

**Files:**
- Modify: `frontend/src/pages/client/home/InfoCards.jsx` (`Location` becomes the Visit Us layout), `frontend/src/pages/client/HomePage.jsx` (section id `visit`), `frontend/src/styles/home.css`
- Test: `frontend/src/test/home.test.jsx`

**Interfaces:**
- Consumes: `salon.addressLines`, `salon.mapQuery` (`content/salon.js`), `hours` (from `schedule` + salon closing time, existing `formatHours`), `useSalon().phone`.

- [ ] **Step 1: Write the failing tests:**
  - `it('Visit Us shows hours, the address and the phone, with no booking button')` — inside `#visit`: text "11:00 AM – 9:00 PM" from the schedule, "201 Mabuhay Compound"; a `tel:` link; `queryByRole('link', { name: /book/i })` is null.
  - `it('hides the phone row when Leah has no phone set')`.
  - `it('Open in Maps points at the salon')` — `href` contains the encoded `mapQuery`, `target="_blank"`, `rel` includes `noopener`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** two columns (info 5/12, map 7/12; stacked info-first on phone), map `aspect-ratio: 4 / 3`, rounded with the shared radius, iframe `loading="lazy"` and a `title`.
- [ ] **Step 4: Run** `npx vitest run` — expect all pass.
- [ ] **Step 5: Look** at 4 widths; the map can be panned and zoomed; Open in Maps opens Google Maps at the salon.
- [ ] **Step 6: Commit** (with your OK): `Landing page: Visit Us with map, no booking button`.

### ✅ Checkpoint 6 — visit us
- [ ] Tests pass · checked at 4 widths · committed
- [ ] Date / commit: ______

---

## Phase 7 — Polish, accessibility and responsive pass

**Database:** none.

**Files:** whatever the checks below point at, in `frontend/src/pages/client/home/`, `frontend/src/styles/home.css`, `frontend/src/components/Layout.jsx`.

- [ ] **Step 1:** Run impeccable `polish` on the landing page (spacing rhythm, type scale, alignment, card consistency) and fix what it finds.
- [ ] **Step 2:** Run impeccable `audit` (contrast, keyboard, focus order, reduced motion, image sizes) and fix what it finds.
- [ ] **Step 3:** Run the impeccable detector once over the changed files: `impeccable detect --json frontend/src/pages/client/home frontend/src/pages/client/GalleryPage.jsx frontend/src/styles/home.css` — fix every finding or record why it stays.
- [ ] **Step 4:** Go through the ui-ux-pro-max pre-delivery checklist: no emoji icons; pointer cursor on clickable things; hover 150–300 ms; contrast 4.5:1; focus visible; reduced motion; 375 / 768 / 1024 / 1440 px.
- [ ] **Step 5:** Phone check at 320 px: no horizontal scroll anywhere on `/` and `/gallery`.
- [ ] **Step 6: Run** `npx vitest run` — expect all pass.
- [ ] **Step 7: Commit** (with your OK): `Landing page: polish and accessibility pass`.

### ✅ Checkpoint 7 — polished
- [ ] Polish and audit findings fixed · detector clean or explained · checklist done · committed
- [ ] Date / commit: ______

---

## Phase 8 — Final check against the brief and ship

**Database:** none.

- [ ] **Step 1:** Walk the brief's final checklist (spec §10) in the browser and tick each line here:
  - [ ] Hero: text left, photo right; logo prominent; *Book an Appointment* goes to booking
  - [ ] Five service cards, 3 over 2, prices match admin Services
  - [ ] Our Works 3 × 3; *View full gallery* opens `/gallery`
  - [ ] Visit Us: info left, map right, no booking button
  - [ ] Meet Leyah in first person; sample text labelled until real
  - [ ] Phone and desktop layouts correct
  - [ ] Sign-in, sign-up, booking, payment step and admin still work (one full booking as a client, confirm as Leah)
- [ ] **Step 2: Run** `npx vitest run` and `npm run build` in `frontend` — both pass.
- [ ] **Step 3:** Update `README.md` only if a page or route was added (D8).
- [ ] **Step 4: Commit** on `landing-page-redesign` and, with your OK, push that branch. **No merge into `main` or `client-revisions`** unless you ask for it separately.

### ✅ Checkpoint 8 — shipped
- [ ] Brief checklist all ticked · tests and build pass · pushed
- [ ] Date / commit: ______
