# Landing Page Redesign — Brief (spec)

Source: the brief the owner of this project pasted on 2026-11-14, kept here so the plan
(`docs/superpowers/plans/2026-11-14-landing-page-redesign.md`) can argue from it. Reference images
(hero, services & pricing, gallery, contact, Meet Leyah) were shared in the same conversation; the plan
describes what each one shows.

Where this brief and the existing code disagree (for example the brief names Blazor while the website
is React + Vite), the plan lists the conflict as a decision and does nothing until it is agreed.

## Summary of the brief

**Objective.** Redesign the existing landing page into a modern, minimalist, professional nail salon
page. Keep the NailsByLeyah branding. Modify the existing landing components; don't duplicate the page,
rebuild the site or change unrelated functionality. Reuse existing photos and brand assets. Preserve
authentication, booking, navigation and database behaviour.

**1. Hero.** Logo prominent near the centre of the header; existing nav links and sign-in/sign-up kept.
Two columns: headline, supporting text and **Book an Appointment** on the left; a high-quality manicure
photo on the right (natural proportions, rounded, no heavy overlays). Soft, flowing blush/dusty-rose
nail-polish curves in a cream background, subtle. Mobile: stacked, headline and button prominent, photo
not cropping the nails.
- Headline: *Beautiful Nails, Beautiful You.*
- Text: *Discover personalized nail care and elegant nail designs at NailsByLeyah. From simple, classic
  manicures to creative nail art, every set is made with care.*
- Button: *Book an Appointment* → the existing booking page.

**2. Services & Pricing.** Five cards: row 1 Plain, BIAB, Soft Gel Extension; row 2 (centred) Nail Design
Add-ons, Removal. Each card: name, short description, price or starting price from the existing service
data, an image or relevant photo, optional duration. Never invent or hardcode unfinalised prices; "Starting
at" when the price depends on options; keep add-on prices and calculations. Equal cards, consistent image
ratio, subtle borders, minimal shadow, rounded corners, uniform type, subtle hover. Tablet 2 columns, phone
1 column.

**3. Our Works.** Heading above a 3 × 3 grid of nine photos (consistent size, rounded, uniform gaps, no
distortion). Click opens a larger preview where supported. **View Full Gallery** link under the grid to the
existing full gallery page or section; don't create a new route if one exists. Desktop 3, tablet 2, phone 1–2
columns.

**4. Visit Us / Contact.** Replace the large burgundy panel with cream. Two columns: left — heading, address,
contact, opening hours, Meet Leyah card or owner intro, Open in Maps; right — the existing map in a rounded
container. Address *201 Mabuhay Compound, Sauyo Road, Quezon City, Philippines* (stored value wins). Contact
details and hours from the system; never invent them. Keep Open in Maps; **remove the booking button** from
this section.

**5. Meet Leyah.** New two-column section: left — heading, intro, first-person bio (I/my/me), how the salon
began, services and approach, goal; right — studio photo in a rounded container. The sample bio is
placeholder only: keep it editable, don't present unverified facts, don't invent a founding year, use a
clearly marked placeholder until real content and photo arrive.

**6. Visual design.** Palette: Cream White #FFF8F4, Blush Pink #F0D5DC, Dusty Rose #C98497, Burgundy
#682C43, Charcoal #30252A. Minimal, soft, elegant, consistent cards, subtle radius, readable type, minimal
shadow, consistent section spacing, restrained hover, quality imagery; avoid heavy pink backgrounds,
clutter and oversized decoration.

**7. Responsive & accessibility.** Desktop, laptop, tablet, phone; responsive nav; no horizontal scroll;
optimised images; accessible contrast; semantic headings; keyboard navigation; alt text; reduced motion;
easy-to-hit buttons and links.

**8. Preserve.** Login/registration, booking, drafts, colour selection, service customisation, add-on
pricing, schedules, payments, booking history, admin, auth, database relationships, business rules. No
duplicate components or unnecessary routes.

**9. Implementation.** Inspect first; reuse images, services and data; add Meet Leyah without disrupting
other sections; "use C# ASP.NET Core Blazor and CSS; avoid React, Next.js or unrelated frameworks" (see the
plan's decision D1); keep navigation destinations and booking actions; keep performance; verify images and
responsive behaviour; build and fix errors.

**10. Final checklist.** Hero left text / right photo; logo prominent; Book an Appointment works; five cards
in 3-over-2; prices accurate; 3 × 3 gallery; View Full Gallery navigates; Visit Us info left, map right;
no booking button in Visit Us; Meet Leyah first person; unverified bio kept as placeholder; responsive;
auth and booking still work.
