import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PageLoader } from '../../../components/ui'
import { Modal } from '../../../components/Modal'
import { canAnimate, peso } from './motion'
import { softGelSets, withDesignName } from '../../../lib/services'
import { SectionHeading } from './SectionHeading'
import { BrandLogo } from '../../../components/BrandLogo'

/** The website's own line for each card, used until Leah writes one on admin Services (D6). */
const DEFAULT_LINES = {
  plain: 'A clean, glossy soft gel in one color.',
  biab: 'A builder gel overlay that strengthens your natural nails.',
  'soft gel extension': 'Longer nails, shaped and built with soft gel.',
  addOns: 'Chrome, cat eye, French tips, rhinestones and more.',
  removal: 'Gentle removal of your old set before the new one.',
}

/** Small line icons in a round badge (D7); decoration only. */
const ICONS = {
  plain: <><path d="M10 3h4v4h-4z" /><path d="M8.5 7h7l1 3v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-9z" /><path d="M7.5 13h9" /></>,
  biab: <><path d="M6.5 21v-8.5a5.5 5.5 0 0 1 11 0V21" /><path d="M9.3 13a2.7 2.7 0 0 1 5.4 0v3.5H9.3z" /></>,
  extension: <><path d="M6.5 21v-6a5.5 5.5 0 0 1 11 0v6" /><path d="M9.3 16.5V8.2C9.3 5.5 10.5 3 12 3s2.7 2.5 2.7 5.2v8.3z" /></>,
  addOns: <><path d="M11 3l1.7 4.8 4.8 1.7-4.8 1.7L11 16l-1.7-4.8-4.8-1.7 4.8-1.7z" /><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  removal: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4v4h-4" /></>,
}

const key = (name) => name.trim().toLowerCase()
// Plain first, then BIAB, then Soft Gel Extension and any set added later (the reference's order).
const CARD_ORDER = { plain: 0, biab: 1 }
const lowest = (items) => (items.length ? Math.min(...items.map((i) => i.price)) : null)
const sentence = (name) => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() // "Not My Work" -> "Not my work"
const hours = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ')
}

/** The five cards when the price list can't be read: names and lines only, "See prices when booking". */
const FALLBACK_CARDS = [
  { id: 'plain', icon: 'plain', name: 'Plain', blurb: DEFAULT_LINES.plain },
  { id: 'biab', icon: 'biab', name: 'BIAB', blurb: DEFAULT_LINES.biab },
  { id: 'extension', icon: 'extension', name: 'Soft Gel Extension', blurb: DEFAULT_LINES['soft gel extension'] },
  { id: 'addOns', icon: 'addOns', name: 'Nail Design Add-ons', blurb: DEFAULT_LINES.addOns },
  { id: 'removal', icon: 'removal', name: 'Removal', blurb: DEFAULT_LINES.removal },
].map((c) => ({ ...c, price: null }))

/** "1 hr" when every removal takes the same time, else the range ("1 hr – 1 hr 30 min"); added before the new set. */
function removalTime(removals) {
  const minutes = [...new Set(removals.map((r) => r.durationMinutes).filter(Boolean))].sort((a, b) => a - b)
  if (minutes.length === 0) return null
  return minutes.length === 1 ? hours(minutes[0]) : `${hours(minutes[0])} – ${hours(minutes.at(-1))}`
}

/** One card per offered set, then add-ons and removal, all from the live price list. */
function serviceCards({ services, addOns }) {
  const active = (items) => items.filter((i) => i.isActive !== false)
  // A design version is never a card of its own, even when its set is turned off (the public list then leaves the set out).
  const isOn = (s) => s && s.isActive !== false
  const sets = softGelSets(services)
    .filter((s) => isOn(s.base) && !s.base.designOptionOfId)
    .map((s) => ({ ...s, design: isOn(s.design) ? s.design : null }))
    .sort((a, b) => (CARD_ORDER[key(a.base.name)] ?? 2) - (CARD_ORDER[key(b.base.name)] ?? 2))
  const extras = active(addOns)
  const removals = active(services.filter((s) => s.category === 'Removal'))
  const takesArt = sets.filter((s) => s.base.allowsAddOns).map((s) => s.base.name)

  const cards = sets.map(({ base, design }) => ({
    id: `set-${base.id}`,
    icon: { plain: 'plain', biab: 'biab' }[key(base.name)] ?? 'extension',
    name: base.name,
    blurb: base.description || DEFAULT_LINES[key(base.name)] || '',
    price: base.price,
    note: design ? `With design · ${peso(design.price)}` : !base.allowsAddOns ? 'Plain color only' : null,
    duration: base.durationMinutes ? hours(base.durationMinutes) : null,
  }))
  if (extras.length) cards.push({
    id: 'addOns', icon: 'addOns', name: 'Nail Design Add-ons', blurb: DEFAULT_LINES.addOns,
    price: lowest(extras), from: true, unit: '/ nail',
    note: takesArt.length ? `Added to ${takesArt.join(' or ')}` : null,
  })
  if (removals.length) cards.push({
    id: 'removal', icon: 'removal', name: 'Removal',
    blurb: removals.find((r) => r.description)?.description || DEFAULT_LINES.removal,
    price: lowest(removals), from: true,
    note: removals.map((r) => <span key={r.id}>{sentence(r.name)} · {peso(r.price)}</span>),
    duration: removalTime(removals),
  })
  return cards
}

function ServiceCard({ card, index }) {
  return (
    <article className="hm-svc" style={{ '--i': index }} aria-labelledby={`svc-${card.id}`}>
      <span className="hm-svc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[card.icon]}
        </svg>
      </span>
      {card.duration && <span className="hm-svc-time"><span className="sr-only">Takes about </span>{card.duration}</span>}
      <h3 id={`svc-${card.id}`}>{card.name}</h3>
      {card.blurb && <p className="hm-svc-blurb">{card.blurb}</p>}
      <div className="hm-svc-price">
        {card.price === null ? (
          <span className="hm-svc-soon">See prices when booking</span>
        ) : (
          <>
            {card.from && <span className="hm-svc-from">From</span>}
            <span className="hm-svc-amount">{peso(card.price)}</span>
            {card.unit && <span className="hm-svc-unit">{card.unit}</span>}
          </>
        )}
      </div>
      {card.price !== null && card.note && <p className="hm-svc-note">{card.note}</p>}
    </article>
  )
}

/**
 * Services & Pricing (Phase 3): a card per service with its icon, line, price and time, all from the live price list,
 * then "View full price list" (opens Leyah's price card in a pop-up) and "Book now". If the prices can't load, the cards still
 * show, without prices.
 */
export function PricingSection({ catalog, bookTo }) {
  const cardsRef = useRef(null)
  const [cardsIn, setCardsIn] = useState(!canAnimate)
  const [listOpen, setListOpen] = useState(false)
  const loaded = Boolean(catalog.data)
  const cards = loaded ? serviceCards(catalog.data) : catalog.error ? FALLBACK_CARDS : null
  const hasCards = Boolean(cards)

  // The cards are drawn once the prices arrive, after the page's own fade-in has looked for elements, so they watch themselves.
  useEffect(() => {
    if (cardsIn || !hasCards) return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCardsIn(true) }, { threshold: 0.15 })
    io.observe(cardsRef.current)
    return () => io.disconnect()
  }, [cardsIn, hasCards])

  return (
    <section className="hm-prices hm-section" id="services" tabIndex={-1} aria-labelledby="services-title">
      <SectionHeading id="services-title" title="Services & Pricing" intro="Final pricing depends on your service, design and add-ons." />
      {!cards && <PageLoader label="Loading prices…" />}
      {cards && (
        <div className={cardsIn ? 'hm-svcs is-in' : 'hm-svcs'} ref={cardsRef}>
          {cards.map((c, i) => <ServiceCard key={c.id} card={c} index={i} />)}
        </div>
      )}
      {catalog.error && !loaded && <p className="hm-svc-offline">Prices couldn&rsquo;t load just now. You&rsquo;ll see them when you book.</p>}
      <div className="hm-price-actions">
        {loaded && (
          <button type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={() => setListOpen(true)}>
            View full price list
          </button>
        )}
        <Link to={bookTo} className="btn btn-primary">Book now</Link>
      </div>
      {/* Only the price card pops up: its ×, Escape or a click outside shuts it, and focus goes back to the button. */}
      {listOpen && loaded && (
        <Modal bare title="Full price list" onClose={() => setListOpen(false)}>
          <PriceCard catalog={catalog.data} />
        </Modal>
      )}
    </section>
  )
}

/**
 * Leyah's full price list, drawn from the live prices so it always matches the booking page: the sets, their design
 * versions, removal and the per-nail add-ons. Styled after her printed price card.
 */
function PriceCard({ catalog }) {
  const active = (items) => items.filter((i) => i.isActive !== false)
  const sets = softGelSets(active(catalog.services))
  const designs = sets.filter((s) => s.design)
  const groups = [
    { title: 'Soft gel', rows: sets.map((s) => [s.base.name, s.base.price]) },
    // What the design adds to its set (+₱100), not the set's total.
    { title: 'With design', note: 'optional', rows: designs.map((s) => [withDesignName(s.base), s.design.price - s.base.price, true]) },
    { title: 'Removal', rows: active(catalog.services.filter((s) => s.category === 'Removal')).map((s) => [s.name, s.price]) },
    { title: 'Add-ons', note: 'per nail', rows: active(catalog.addOns).map((a) => [a.name, a.price]) },
  ].filter((g) => g.rows.length)
  return (
    <article className="pc" aria-labelledby="pc-title">
      <BrandLogo className="brand-logo pc-logo" />
      <h3 className="pc-title" id="pc-title">Nails price list</h3>
      {groups.map((g) => (
        <section key={g.title} className="pc-group" aria-label={g.title}>
          <h4 className="pc-pill">{g.title}{g.note && <small> ({g.note})</small>}</h4>
          <dl>
            {g.rows.map(([name, price, extra]) => (
              <div key={name} className="pc-row"><dt>{name}</dt><span className="pc-dots" aria-hidden="true" /><dd>{extra && <span className="pc-plus">+</span>}{peso(price)}</dd></div>
            ))}
          </dl>
        </section>
      ))}
      <p className="pc-foot" aria-hidden="true">♡</p>
    </article>
  )
}
