import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LIMITS } from '../validation/rules'
import { COLLECTION, SHADE_COLORS, SHADE_NAMES, colorFor, colorLabel, perNailText, shadeNumber } from '../lib/shades'

/**
 * Two glossy gel nails in one color, like a swatch on the salon's color chart: almond nails with darker rims,
 * a long soft shine down the left side and a bright glint near the tip. The shading and shine are drawn over the
 * color, so one drawing works for every shade, from white to near-black.
 */
// Memoised: hovering the chart changes the preview many times a second, and the 58 swatches never need to redraw for it.
export const NailPair = memo(function NailPair({ color, className = '' }) {
  const id = useId().replace(/:/g, '')
  // An almond nail, 26 wide and 60 tall, tip at the top.
  const nail = 'M13 1C19 1 25.5 14 25.5 34S21.5 64 13 64 .5 54 .5 34 7 1 13 1Z'
  return (
    <svg className={`nail-pair ${className}`} viewBox="0 0 58 69" aria-hidden="true" focusable="false">
      <defs>
        {/* Light from the upper left: the middle lifts a little, the rims fall into shadow. */}
        <radialGradient id={`${id}b`} cx=".38" cy=".36" r=".72">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity=".08" />
          <stop offset="1" stopColor="#000" stopOpacity=".38" />
        </radialGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".7" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* A soft white spot that fades out to its edge. The highlights use it instead of blur filters: they look the
            same, but 58 swatches with blur filters made the color chart lag (2026-11-16). */}
        <radialGradient id={`${id}w`}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}><path d={nail} /></clipPath>
      </defs>
      {[{ x: 2.5, r: -3 }, { x: 29.5, r: 3 }].map(({ x, r }) => (
        <g key={x} transform={`translate(${x} 2) rotate(${r} 13 33)`}>
          <path d={nail} fill={color} />
          <g clipPath={`url(#${id}c)`}>
            <path d={nail} fill={`url(#${id}b)`} />
            <path d={nail} fill={`url(#${id}d)`} />
            {/* broad soft sheen, then the sharp shine along the left side */}
            <ellipse cx="9" cy="27" rx="8.5" ry="21" fill={`url(#${id}w)`} opacity=".42" />
            <ellipse cx="16.5" cy="22" rx="6" ry="13.5" fill={`url(#${id}w)`} opacity=".18" />
            <path d="M5.6 13C3.6 22 3.4 35 5.8 46" stroke={`url(#${id}s)`} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity=".9" />
            {/* bright glint near the tip, and the faint light caught on the lower right rim */}
            <ellipse cx="16.8" cy="10" rx="3.2" ry="5.6" transform="rotate(22 16.8 10)" fill={`url(#${id}w)`} opacity=".95" />
            <path d="M22.8 38C22.6 47 20.6 55 16.5 60" stroke="#fff" strokeOpacity=".24" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </g>
          <path d={nail} fill="none" stroke="#000" strokeOpacity=".1" strokeWidth=".8" />
        </g>
      ))}
    </svg>
  )
})

/** Pink satin bow for the corner of the color chart. */
function Bow() {
  return (
    <svg className="cp-bow" viewBox="0 0 220 190" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cpBowA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe3ec" />
          <stop offset=".5" stopColor="#f6a9c0" />
          <stop offset="1" stopColor="#e07b9b" />
        </linearGradient>
        <linearGradient id="cpBowB" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe8ef" />
          <stop offset=".55" stopColor="#f3a2ba" />
          <stop offset="1" stopColor="#d96f91" />
        </linearGradient>
      </defs>
      {/* tails */}
      <path d="M100 92C88 120 70 150 44 178L66 170 74 186C94 158 106 128 112 98Z" fill="url(#cpBowB)" />
      <path d="M118 96C128 124 142 150 166 170L146 168 142 184C122 160 112 130 108 100Z" fill="url(#cpBowA)" />
      {/* loops */}
      <path d="M104 84C78 44 26 24 14 52 4 78 46 106 102 98Z" fill="url(#cpBowA)" />
      <path d="M100 90C72 70 38 58 30 64" stroke="#fff" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M116 84C140 40 196 20 208 50 218 78 172 104 118 98Z" fill="url(#cpBowB)" />
      <path d="M122 88C150 66 184 54 194 60" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* knot */}
      <ellipse cx="110" cy="91" rx="15" ry="13" fill="url(#cpBowB)" />
      <ellipse cx="106" cy="86" rx="6" ry="4" fill="#fff" opacity=".7" />
    </svg>
  )
}

// Sorted: object keys like "10" come before "01" otherwise, which would scramble the chart.
const NUMBERS = Object.keys(SHADE_COLORS).sort()

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
const HAND_COLUMNS = [['left', 'Left hand'], ['right', 'Right hand']]
export const EMPTY_NAILS = { left: [null, null, null, null, null], right: [null, null, null, null, null] }

/** Whether any nail has its own color, and whether all ten do. */
export const nailsStarted = (nails) => Boolean(nails && [...nails.left, ...nails.right].some(Boolean))
export const nailsComplete = (nails) => Boolean(nails && [...nails.left, ...nails.right].every(Boolean))

/**
 * "Color for each nail" (optional), inside the chart window: tap any nail on either hand, then a shade on the chart.
 * The client can give as few as one nail its own color; nails left empty get the main color.
 */
function NailSlots({ nails, target, onTarget, onClear, onRemove, off = false }) {
  const targetLabel = target && `${target.hand} ${FINGERS[target.index].toLowerCase()}`
  return (
    <div className={off ? 'cp-nails is-off' : 'cp-nails'} role="group" aria-label="Color for each nail">
      <div className="cp-nails-head">
        <h3>Color for each nail <span className="pick-optional">(optional)</span></h3>
        {nailsStarted(nails) && !off && <button type="button" className="link-button" onClick={onClear}>Clear all</button>}
      </div>
      <p className="cp-nails-hint" aria-live="polite">
        {off ? 'Not needed: Leyah helps you choose at the salon.' : target ? <>Now tap a shade for your <strong>{targetLabel}</strong>.</>
          : 'Tap any nail, then a shade. Nails you leave empty get your main color.'}
      </p>
      {HAND_COLUMNS.map(([hand, label]) => {
        const locked = off
        return (
          <div key={hand} className={locked ? 'cp-hand is-locked' : 'cp-hand'} role="group" aria-label={label}>
            <span className="cp-hand-label">{label.split(' ')[0]}</span>
            <div className="cp-hand-nails">
              {FINGERS.map((finger, i) => {
                const c = nails[hand][i]
                const on = target?.hand === hand && target.index === i
                return (
                  <div key={finger} className="cp-slot-wrap">
                    <button type="button" disabled={locked} aria-pressed={on} title={c ? `${finger}: ${colorLabel(c)}` : finger}
                      className={['cp-slot', c && 'chosen', on && 'on'].filter(Boolean).join(' ')} onClick={() => onTarget(on ? null : { hand, index: i })}
                      aria-label={`${label}, ${finger.toLowerCase()}: ${c ? `${colorLabel(c)}. Change color` : 'choose a color'}`}>
                      {c ? <NailPair color={colorFor(c)} className="cp-slot-nails" /> : <span className="cp-slot-empty" aria-hidden="true">+</span>}
                      <span className="cp-slot-name" aria-hidden="true">{finger}</span>
                    </button>
                    {/* Takes this one nail's color off; it gets the main color again. */}
                    {c && !locked && (
                      <button type="button" className="cp-slot-remove" onClick={() => onRemove(hand, i)}
                        aria-label={`Remove color from ${label.split(' ')[0].toLowerCase()} ${finger.toLowerCase()}`} title="Remove this color">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The color chart in a window: the 58 Conspiracy Theories swatches on the left, the chosen one large on the right,
 * and, when the booking allows it, a color for each nail, the salon's other choices ("Not sure yet") and "Can't find
 * your color?" with a box to describe it. Nothing changes until the button at the bottom; closing keeps the choice
 * made before.
 */
export function ColorPickerModal({ value, onChoose, onClose, nails: savedNails, onNails, others = [], request = null, onRequest, outOfStock = [] }) {
  const missing = (n) => outOfStock.includes(`#${n}`) // shades Leyah has run out of can't be picked
  const titleId = useId()
  const dialogRef = useRef(null)
  const gridRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })
  const [picked, setPicked] = useState(() => shadeNumber(value))
  const [shown, setShown] = useState(() => shadeNumber(value)) // the shade in the large preview: the last one tapped
  const [peek, setPeek] = useState(null) // a shade looked at (hover, focus, long press) but not chosen
  const [nails, setNails] = useState(savedNails ?? EMPTY_NAILS)
  const [target, setTarget] = useState(null) // the nail the next tapped shade goes on
  const [other, setOther] = useState(() => (others.includes(value) ? value : null)) // e.g. "Not sure yet (decide at the salon)"
  const [asking, setAsking] = useState(request !== null) // "Can't find your color?"
  const [requestText, setRequestText] = useState(request ?? '')
  const [focusN, setFocusN] = useState(null) // the shade that holds the grid's one Tab stop
  const started = Boolean(onNails) && nailsStarted(nails)
  const complete = nailsComplete(nails)

  // A shade, one of the salon's other choices, or a color request: choosing one sets the others aside.
  const choose = ({ shade = null, otherChoice = null, ask = false }) => {
    setPicked(shade); setShown(shade); setOther(otherChoice); setAsking(ask)
    if (otherChoice) { setNails(EMPTY_NAILS); setTarget(null) }
  }
  const undecided = Boolean(other) // "Not sure yet": the color is chosen at the salon, so the chart is switched off
  const tapShade = (n) => {
    setShown(n)
    if (!target) { choose({ shade: n }); return }
    setNails({ ...nails, [target.hand]: nails[target.hand].map((c, i) => (i === target.index ? `#${n}` : c)) })
    setTarget(null) // the next tap on a shade sets the main color again, unless another nail is tapped first
  }
  const checked = target ? shadeNumber(nails[target.hand][target.index]) : picked
  const use = () => {
    if (asking) onRequest?.(requestText.trim())
    else if (other) onChoose(other)
    else if (picked) onChoose(`#${picked}`)
    onNails?.(started ? nails : EMPTY_NAILS)
    onClose()
  }
  const hasChoice = Boolean(picked || other || asking || started || nailsStarted(savedNails))
  // Some nails with their own color and some without: the others need the main color.
  const needsMain = started && !complete && !picked
  const blocked = !hasChoice || (asking && !requestText.trim()) || needsMain
  const useLabel = asking ? 'Ask Leyah for This Color' : started ? 'Use These Colors' : other ? 'Use This Choice' : 'Use This Color'

  useEffect(() => {
    const before = document.activeElement
    ;(dialogRef.current?.querySelector('.cp-grid [aria-checked="true"]') ?? dialogRef.current)?.focus()
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      before?.focus?.()
    }
  }, [])

  // The grid is one Tab stop; arrows, Home and End move between shades without choosing (Enter or Space chooses).
  const usable = (n) => !undecided && !missing(n)
  const tabStop = [focusN, checked].find((n) => n && usable(n)) ?? NUMBERS.find(usable)
  const onGridKey = (e) => {
    const from = NUMBERS.indexOf(e.target.dataset?.n)
    if (from < 0) return
    const template = gridRef.current ? getComputedStyle(gridRef.current).gridTemplateColumns : ''
    const columns = template && template !== 'none' ? template.split(' ').filter(Boolean).length : 10
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key]
    let to = -1
    if (e.key === 'Home') to = NUMBERS.findIndex(usable)
    else if (e.key === 'End') to = NUMBERS.findLastIndex(usable)
    else if (step) {
      for (let i = from + step; i >= 0 && i < NUMBERS.length; i += step) if (usable(NUMBERS[i])) { to = i; break }
    } else return
    e.preventDefault()
    if (to >= 0) gridRef.current?.querySelector(`[data-n="${NUMBERS[to]}"]`)?.focus()
  }

  // Quick compare: a mouse hover, keyboard focus or a long press shows a shade without choosing it. A long press never
  // also chooses: the click that follows it is ignored.
  const press = useRef({ timer: null, shade: null })
  useEffect(() => () => clearTimeout(press.current.timer), [])
  const pressStart = (n, e) => {
    clearTimeout(press.current.timer)
    press.current.shade = null
    if (e.pointerType === 'mouse' || !usable(n)) return // a shade that can't be chosen isn't previewed either
    press.current.timer = setTimeout(() => { press.current.shade = n; setPeek(n) }, 450)
  }
  const pressEnd = (n) => {
    clearTimeout(press.current.timer)
    if (press.current.shade !== n) return
    setPeek((p) => (p === n ? null : p))
    // Swallow only the click that comes straight after the long press; many phones send none, and a later Enter or
    // screen-reader tap on the same shade must still choose it.
    press.current.timer = setTimeout(() => { if (press.current.shade === n) press.current.shade = null }, 400)
  }
  const onShadeClick = (n) => {
    if (press.current.shade === n) { press.current.shade = null; return }
    tapShade(n)
  }

  const preview = peek ?? shown
  const previewing = Boolean(peek) && peek !== shown
  const info = preview ? SHADE_NAMES[preview] : null
  const cardLabel = previewing ? 'Previewing' : shown && shown !== picked ? 'Shade for your nail' : 'Selected Color'
  // The compact line in the phone header: what the Use button will save.
  const now = asking ? 'Color request' : started ? `${[...nails.left, ...nails.right].filter(Boolean).length} of 10 nails`
    : other ?? (picked ? `#${picked} ${SHADE_NAMES[picked]?.name ?? ''}`.trim() : 'Nothing yet')

  return createPortal(
    <div className="modal-backdrop cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="cp-head">
          <h2 id={titleId}>Choose Nail Color</h2>
          <p className="cp-intro">Select a color from the {COLLECTION.name} collection.</p>
          {/* Phones only: the chart scrolls under this header, so the choice (or the shade being previewed) shows here. */}
          <p className="cp-now">
            <span>{previewing ? 'Previewing:' : 'Selected:'}</span>{' '}
            {(previewing || (!started && picked && !other && !asking)) && (
              <span className="cp-now-dot" aria-hidden="true" style={{ background: SHADE_COLORS[previewing ? peek : picked] }} />
            )}
            <span className="cp-now-text">{previewing ? `#${peek} ${SHADE_NAMES[peek]?.name ?? ''}`.trim() : now}</span>
          </p>
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <section className="cp-chart" aria-label={`${COLLECTION.name} color chart`}>
          <Bow />
          <svg className="cp-arc" viewBox="0 0 400 70" aria-hidden="true">
            <path id="cpArc" d="M20 66Q200 -6 380 66" fill="none" />
            <text><textPath href="#cpArc" startOffset="50%" textAnchor="middle" textLength="330" lengthAdjust="spacingAndGlyphs">NAIL POLISH DISPLAY FULL SPECIAL PALETTE COLLECTION</textPath></text>
          </svg>
          <div className="cp-chart-head">
            <p className="cp-collection"><span>{COLLECTION.name.split(' ')[0]}</span>{COLLECTION.name.split(' ').slice(1).join(' ')}</p>
            <p className="cp-code"><strong>{COLLECTION.code}</strong>Swatches</p>
          </div>

          <div className={undecided ? 'cp-grid is-off' : 'cp-grid'} role="radiogroup" aria-label="Shades" aria-disabled={undecided || undefined}
            ref={gridRef} onKeyDown={onGridKey}>
            {NUMBERS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={checked === n} data-n={n} tabIndex={n === tabStop ? 0 : -1}
                aria-label={`Shade #${n}${SHADE_NAMES[n] ? `, ${SHADE_NAMES[n].name}` : ''}${missing(n) ? ', out of stock' : ''}`}
                title={missing(n) ? `${colorLabel(`#${n}`)} · out of stock` : colorLabel(`#${n}`)}
                className={['cp-swatch', checked === n && 'on', missing(n) && 'is-out'].filter(Boolean).join(' ')}
                onClick={() => onShadeClick(n)}
                onFocus={() => { setFocusN(n); setPeek(n) }} onBlur={() => setPeek((p) => (p === n ? null : p))}
                onPointerEnter={(e) => e.pointerType === 'mouse' && usable(n) && setPeek(n)}
                onPointerLeave={(e) => { pressEnd(n); if (e.pointerType === 'mouse') setPeek((p) => (p === n ? null : p)) }}
                onPointerDown={(e) => pressStart(n, e)} onPointerUp={() => pressEnd(n)} onPointerCancel={() => pressEnd(n)}
                onContextMenu={(e) => press.current.shade === n && e.preventDefault()}
                disabled={undecided || missing(n)}>
                <NailPair color={SHADE_COLORS[n]} />
                <span className="cp-num">#{n}</span>
                {missing(n) && <span className="cp-out" aria-hidden="true">Out of stock</span>}
                {checked === n && (
                  <span className="cp-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg></span>
                )}
              </button>
            ))}
          </div>
          <p className="cp-foot" aria-hidden="true"><span>✦</span>Fashion display color<span>✦</span></p>
        </section>

        <section className="cp-side">
          <p className="cp-notice" role="note">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            <span>Screen colors can differ from the real polish. Leyah can show you the bottle at the salon.</span>
          </p>

          {/* One card for the shade: large nails, its number and name, and what it looks like. */}
          <div className={preview ? 'cp-pick' : 'cp-pick is-empty'} aria-live={previewing ? 'off' : 'polite'}>
            <h3 className={previewing ? 'cp-pick-label is-peek' : 'cp-pick-label'}>{cardLabel}</h3>
            {preview ? (
              <div className="cp-pick-body">
                <NailPair color={SHADE_COLORS[preview]} className="cp-pick-nails" />
                <div className="cp-pick-text">
                  <div className="cp-pick-name"><span className="cp-pill">#{preview}</span><h4>{info?.name ?? `Shade ${preview}`}</h4></div>
                  <p className="cp-pick-desc">{info?.description ?? `From the ${COLLECTION.name} ${COLLECTION.code} chart. Leyah uses this exact bottle for your set.`}</p>
                </div>
                {!previewing && preview === picked && (
                  <button type="button" className="cp-clear" onClick={() => { setPicked(null); setShown(null) }} aria-label={`Clear #${picked}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
                  </button>
                )}
              </div>
            ) : (
              // Every state without a shade has the same two lines, so the card keeps its height.
              <p className="cp-pick-empty">
                {other ?? (asking ? 'Color request' : 'No color selected yet.')}
                <span className="cp-pick-sub">{other ? 'Tap it again to choose a shade instead.' : asking ? 'Describe the color below.' : 'Tap a shade on the chart.'}</span>
              </p>
            )}
          </div>

          {onNails && (
            <NailSlots nails={nails} target={target} onTarget={setTarget} off={undecided}
              onClear={() => { setNails(EMPTY_NAILS); setTarget(null) }}
              onRemove={(hand, index) => {
                setNails({ ...nails, [hand]: nails[hand].map((c, i) => (i === index ? null : c)) })
                if (target?.hand === hand && target.index === index) setTarget(null)
              }} />
          )}

          {(others.length > 0 || onRequest) && (
            <div className="cp-others">
              <h3 className="cp-others-label">Other options</h3>
              <div className="chips" role="radiogroup" aria-label="Other color choices">
                {others.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={other === c} className={other === c ? 'chip color-chip selected' : 'chip color-chip'}
                    onClick={() => choose({ otherChoice: other === c ? null : c })}>{c}</button>
                ))}
                {onRequest && (
                  <button type="button" role="radio" aria-checked={asking} className={asking ? 'chip color-chip selected' : 'chip color-chip'}
                    onClick={() => choose({ ask: !asking })}>Can&apos;t find your color?</button>
                )}
              </div>
              {asking && (
                <div className="cp-request">
                  <div className="pick-title-row">
                    <label htmlFor="color-request" className="field-label pick-title">Describe the color you&apos;d like <span className="required" aria-hidden="true">*</span></label>
                    <span className="field-counter" aria-live="polite">{requestText.length}/{LIMITS.colorRequestMax}</span>
                  </div>
                  <textarea id="color-request" className="input textarea" rows={2} maxLength={LIMITS.colorRequestMax} value={requestText}
                    placeholder="e.g. A soft sage green, a little lighter than #21" onChange={(e) => setRequestText(e.target.value)} />
                  <p className="cp-request-hint">Leyah checks whether she has this shade and lets you know. Your booking shows &ldquo;Color request: pending confirmation&rdquo; until she does.</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* The Use button in its own bar: on phones it stays at the bottom of the screen while the chart scrolls. */}
        <div className="cp-usebar">
          {needsMain && <p className="cp-use-note">Tap a shade for your other nails (your main color), or give all 10 nails a color.</p>}
          {asking && !requestText.trim() && <p className="cp-use-note">Describe the color you&apos;re looking for.</p>}
          <button type="button" className="cp-use" onClick={use} disabled={blocked}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {useLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The "Choose a color" part of the booking: the chosen shade (or a button to open the chart), plus any other
 * choices on the salon's list such as "Not sure yet (decide at the salon)".
 */
export function ColorChooser({ colors, value, onChange, request = null, onRequest, nails, onNails, outOfStock = [] }) {
  const [open, setOpen] = useState(false)
  const others = colors.filter((c) => !shadeNumber(c))
  const shade = shadeNumber(value)
  const eachNail = !shade && nailsComplete(nails)
  const asking = request !== null
  const otherChosen = !shade && !asking && others.includes(value)
  const chosen = Boolean(shade || eachNail || asking || otherChosen)
  const title = shade ? colorLabel(value) : asking ? 'Color request' : otherChosen ? value : eachNail ? 'A color for each nail' : 'Tap here to choose your color'
  const sub = shade || eachNail ? `${COLLECTION.name} ${COLLECTION.code}`
    : asking ? (request.trim() || 'Describe the color in the chart')
      : otherChosen ? 'Leyah helps you choose at the salon' : `58 shades from the ${COLLECTION.name} color chart`
  return (
    <div className="cc">
      <button type="button" className={chosen ? 'cc-card chosen' : 'cc-card'} onClick={() => setOpen(true)}
        aria-label={shade ? `Color ${title}. Change color` : eachNail && !asking ? 'A color for each nail. Change colors' : chosen ? `${title}. Change color` : 'Open the color chart'}>
        {shade ? <NailPair color={colorFor(value)} className="cc-nails" /> : <span className="cc-chart-icon" aria-hidden="true">{
          (eachNail ? [...nails.left, ...nails.right].slice(0, 5).map(shadeNumber) : ['06', '13', '22', '17', '51'])
            .map((n, i) => <span key={i} style={{ background: SHADE_COLORS[n] }} />)
        }</span>}
        <span className="cc-text">
          <strong>{title}</strong>
          <span>{sub}</span>
        </span>
        <span className="cc-action">{chosen ? 'Change' : 'Choose color'}<span aria-hidden="true"> ›</span></span>
      </button>
      {nailsStarted(nails) && <p className="cc-nails-text muted small">Each nail: {perNailText(nails)}</p>}
      {open && (
        <ColorPickerModal value={value} onChoose={onChange} onClose={() => setOpen(false)} nails={nails} onNails={onNails} outOfStock={outOfStock}
          others={others} request={request} onRequest={onRequest} />
      )}
    </div>
  )
}
