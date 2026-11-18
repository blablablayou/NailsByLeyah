import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { calculateQuote } from '../../lib/pricing'
import { softGelSets, withDesignName } from '../../lib/services'
import { colorLabel } from '../../lib/shades'
import { formatDate, formatTime } from '../../lib/format'
import { today } from '../../lib/dates'
import { Modal } from '../../components/Modal'
import { DayPicker } from '../../components/DateFilter'
import { Alert, Button, Money, SelectField, TextField } from '../../components/ui'
import { LIMITS } from '../../validation/rules'

const PAID = [
  { value: 'None', label: 'Nothing yet' },
  { value: 'Deposit', label: 'Deposit' },
  { value: 'Full', label: 'Full payment' },
]
const METHODS = [{ value: 'Cash', label: 'Cash' }, { value: 'GCash', label: 'GCash' }, { value: 'Maya', label: 'Maya' }]
// Clients with an account book online themselves; Leyah only books people who come in or message the salon's pages.
const SOURCES = [
  { value: 'Walk-in', note: 'Walk-in' },
  { value: 'Facebook', note: 'Booked through Facebook' },
  { value: 'Instagram', note: 'Booked through Instagram' },
]

const hours = (minutes) => {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ')
}

/**
 * Arrow keys inside a radio group: move to the next or previous option and pick it, as a native radio group does
 * (Left/Up back, Right/Down on, wrapping round). Tab enters and leaves the group in one step.
 */
export function onRadioArrows(e) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  if (!step) return
  const radios = [...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')]
  const at = radios.indexOf(document.activeElement)
  if (at < 0) return
  e.preventDefault()
  const next = radios[(at + step + radios.length) % radios.length]
  next.focus()
  next.click()
}

/** Only the chosen option (or the first, when none is) is a Tab stop. */
const tabStop = (options, value, i) => (options.some((o) => o.value === value) ? (options[i].value === value ? 0 : -1) : (i === 0 ? 0 : -1))

/** A row of chips that behaves as one radio group: one Tab stop, arrow keys to move, the chosen chip highlighted. */
function ChipGroup({ label, options, value, onChange, className = '', describedBy }) {
  return (
    <div className={`nb-chips ${className}`} role="radiogroup" aria-label={label} aria-describedby={describedBy} onKeyDown={onRadioArrows}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} tabIndex={tabStop(options, value, i)}
          aria-label={o.hint ? `${o.label}, ${o.hint}` : undefined}
          className={value === o.value ? 'nb-chip is-on' : 'nb-chip'} onClick={() => onChange(o.value)}>
          {o.label}{o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  )
}

/**
 * Leyah books an appointment herself, for a walk-in or someone who messaged on Facebook or Instagram. The booking is
 * confirmed straight away, and what was already paid is recorded as received.
 *
 * Laid out for speed: services as cards, removal, open times and payment as chips, nail art with − / + steppers, and a
 * live summary (the money always in view) beside the form, below it on phones. What is asked, checked and saved is the
 * same as before.
 */
export function NewBookingDialog({ onClose, onCreated }) {
  const catalog = useAsync(() => api.catalog.get(), [])
  const [source, setSource] = useState('Walk-in')
  const [guest, setGuest] = useState({ name: '', phone: '' })

  const [serviceId, setServiceId] = useState('')
  const [removalId, setRemovalId] = useState('')
  const [nails, setNails] = useState({}) // addOnId -> nail count
  const [color, setColor] = useState('')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState('None')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const services = catalog.data?.services ?? []
  const service = services.find((s) => String(s.id) === serviceId)
  const removal = services.find((s) => String(s.id) === removalId)
  const isSet = service?.category === 'SoftGel'
  const slots = useAsync(() => (serviceId && date ? api.catalog.slots(date, serviceId, isSet ? removalId || undefined : undefined) : Promise.resolve(null)),
    [serviceId, removalId, date])
  const openTimes = (slots.data?.slots ?? []).filter((s) => s.status === 'Open')

  if (catalog.loading && !catalog.data) return <Modal title="New booking" onClose={onClose}><p className="muted">Loading the price list…</p></Modal>
  if (catalog.error) return <Modal title="New booking" onClose={onClose}><Alert kind="error">{errorMessage(catalog.error)}</Alert></Modal>

  // The sets as clients book them (Plain, Soft Gel Extension, BIAB), each with its "with design" version as a tick.
  const sets = softGelSets(services)
  const removals = services.filter((s) => s.category === 'Removal')
  const chosenSet = sets.find(({ base, design }) => String(base.id) === serviceId || (design && String(design.id) === serviceId))
  const withDesign = Boolean(chosenSet?.design && String(chosenSet.design.id) === serviceId)
  const addOns = service?.allowsAddOns ? catalog.data.addOns : []
  const chosenAddOns = addOns.filter((a) => nails[a.id] > 0).map((a) => ({ addOn: a, nailCount: nails[a.id] }))
  const quote = service ? calculateQuote(service, chosenAddOns, catalog.data.depositAmount, isSet ? removal : null) : null
  const colors = catalog.data.nailColors ?? []
  // A different service (or its design version) takes a different time, so the chosen time and nail art start over.
  const pickService = (value) => { setServiceId(value); setTime(''); setNails({}) }
  const setNailCount = (id, n) => setNails((all) => ({ ...all, [id]: Math.max(0, Math.min(10, n)) }))
  const leftToPay = quote ? (paid === 'Full' ? 0 : paid === 'Deposit' ? quote.balanceDue : quote.total) : 0
  // What is recorded as paid, as the backend records it: at least the deposit, even for a booking that costs less.
  const paidNow = quote ? (paid === 'Full' ? quote.fullAmount : paid === 'Deposit' ? quote.deposit : 0) : 0

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!guest.name.trim()) found.guestName = "Type the client's name."
    if (guest.phone && !/^\d{11}$/.test(guest.phone)) found.guestPhone = 'Not a valid phone number.'
    if (!service) found.serviceId = 'Choose a service.'
    if (!time) found.startTime = 'Choose a time.'
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const booking = await api.admin.createBooking({
        guestName: guest.name.trim(),
        guestPhone: guest.phone || null,
        serviceId: service.id,
        removalServiceId: isSet && removal ? removal.id : null,
        addOns: chosenAddOns.map(({ addOn, nailCount }) => ({ addOnId: addOn.id, nailCount, hand: 'Both' })),
        nailColor: isSet && color ? color : null,
        bookingDate: date,
        startTime: time,
        // Where the booking came from leads the note, so it shows wherever the note does.
        note: [SOURCES.find((x) => x.value === source).note, note.trim()].filter(Boolean).join('. '),
        paid,
        paymentMethod: method,
        paymentReference: paid !== 'None' && reference.trim() ? reference.trim() : null,
      })
      onCreated(booking)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
      setSaving(false)
    }
  }

  return (
    <Modal size="xl" title="New booking" onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="new-booking" loading={saving}>Book and confirm</Button>
    </>}>
      <p className="nb-intro">For walk-ins and clients who message on Facebook or Instagram. It is confirmed straight away.</p>
      <div className="nb-layout">
        <form id="new-booking" className="nb" onSubmit={submit} noValidate>
          {errors.form && <Alert kind="error">{errors.form}</Alert>}

          <section className="nb-section" aria-labelledby="nb-client">
            <div className="nb-section-head">
              <h3 id="nb-client">Client</h3>
              <ChipGroup label="Booked through" value={source} onChange={setSource}
                options={SOURCES.map((x) => ({ value: x.value, label: x.value }))} />
            </div>
            <div className="grid-2">
              <TextField label="Name" required maxLength={LIMITS.guestNameMax} value={guest.name} error={errors.guestName}
                onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} />
              <TextField label="Phone (optional)" inputMode="numeric" maxLength={11} placeholder="09171234567" value={guest.phone} error={errors.guestPhone}
                onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value.replace(/\D/g, '') }))} />
            </div>
          </section>

          <section className="nb-section" aria-labelledby="nb-service">
            <h3 id="nb-service">Service</h3>
            <div className="nb-cards" role="radiogroup" aria-label="Service" aria-describedby={errors.serviceId ? 'nb-service-error' : undefined}
              onKeyDown={onRadioArrows}>
              {sets.map(({ base }, i) => {
                const on = chosenSet?.base.id === base.id
                return (
                  <button key={base.id} type="button" role="radio" aria-checked={on} className={on ? 'nb-card is-on' : 'nb-card'}
                    tabIndex={chosenSet ? (on ? 0 : -1) : (i === 0 ? 0 : -1)}
                    aria-label={`${base.name}, ₱${base.price}${base.durationMinutes ? `, ${hours(base.durationMinutes)}` : ''}`}
                    // The chosen set clicked again goes back to the plain set (unticks With design).
                    onClick={() => (!on || withDesign) && pickService(String(base.id))}>
                    <strong>{base.name}</strong>
                    <span className="nb-card-meta"><Money amount={base.price} />{base.durationMinutes ? ` · ${hours(base.durationMinutes)}` : ''}</span>
                  </button>
                )
              })}
            </div>
            {errors.serviceId && <p className="field-error" id="nb-service-error">{errors.serviceId}</p>}

            {chosenSet?.design && (
              <label className={withDesign ? 'nb-tick is-on' : 'nb-tick'}>
                <input type="checkbox" checked={withDesign}
                  onChange={(e) => pickService(String(e.target.checked ? chosenSet.design.id : chosenSet.base.id))} />
                <span>With design <small>+<Money amount={chosenSet.design.price - chosenSet.base.price} /></small></span>
              </label>
            )}

            {isSet && removals.length > 0 && (
              <div className="nb-row">
                <span className="nb-row-label">Removal first</span>
                <ChipGroup label="Removal first" value={removalId} onChange={(v) => { setRemovalId(v); setTime('') }}
                  options={[{ value: '', label: 'No removal' }, ...removals.map((r) => ({ value: String(r.id), label: r.name, hint: `₱${r.price}` }))]} />
              </div>
            )}

            {isSet && colors.length > 0 && (
              <SelectField label="Color" placeholder="Decide at the salon" value={color}
                options={colors.map((c) => ({ value: c, label: colorLabel(c) }))} onChange={(e) => setColor(e.target.value)} />
            )}

            {addOns.length > 0 && (
              <fieldset className="nb-addons">
                <legend>Nail art <small>(per nail)</small></legend>
                {addOns.map((a) => {
                  const n = nails[a.id] ?? 0
                  return (
                    <div key={a.id} className={n > 0 ? 'nb-addon is-on' : 'nb-addon'}>
                      <span className="nb-addon-name">{a.name} <small><Money amount={a.price} />/nail</small></span>
                      <span className="nb-stepper">
                        <button type="button" aria-label={`Fewer nails with ${a.name}`} disabled={n === 0} onClick={() => setNailCount(a.id, n - 1)}>−</button>
                        <output aria-label={`Nails with ${a.name}`} aria-live="off">{n}</output>
                        <button type="button" aria-label={`More nails with ${a.name}`} disabled={n === 10} onClick={() => setNailCount(a.id, n + 1)}>+</button>
                      </span>
                    </div>
                  )
                })}
              </fieldset>
            )}
            {removals.length > 0 && (
              <div className="nb-row nb-row-alt">
                <span className="nb-row-label">Or removal only</span>
                <ChipGroup label="Removal only" value={removals.some((r) => String(r.id) === serviceId) ? serviceId : null}
                  onChange={(v) => v !== serviceId && pickService(v)}
                  options={removals.map((r) => ({ value: String(r.id), label: r.name, hint: `₱${r.price}` }))} />
              </div>
            )}
          </section>

          <section className="nb-section" aria-labelledby="nb-when">
            <h3 id="nb-when">Date and time</h3>
            <DayPicker label="Date" required min={today()} value={date} onChange={(value) => { if (value) { setDate(value); setTime('') } }} />
            <div className="nb-times">
              <span className="nb-row-label">Time<span className="required" aria-hidden="true"> *</span></span>
              {!service ? (
                <p className="nb-hint">Pick a service to see open times.</p>
              ) : slots.loading ? (
                <p className="nb-hint">Loading times…</p>
              ) : openTimes.length === 0 ? (
                <p className="nb-hint">No open times this day.</p>
              ) : (
                <ChipGroup label="Time" value={time} onChange={setTime} className="nb-time-chips" describedBy={(errors.startTime ?? errors.bookingDate) ? 'nb-time-error' : undefined}
                  options={openTimes.map((t) => ({ value: t.startTime, label: `${formatTime(t.startTime)} – ${formatTime(t.endTime)}` }))} />
              )}
              {(errors.startTime ?? errors.bookingDate) && <p className="field-error" id="nb-time-error">{errors.startTime ?? errors.bookingDate}</p>}
            </div>
            <TextField label="Note (optional)" maxLength={LIMITS.noteMax - 30} value={note} placeholder="e.g. Short almond, first visit" onChange={(e) => setNote(e.target.value)} />
          </section>

          <section className="nb-section" aria-labelledby="nb-pay">
            <h3 id="nb-pay">Payment received</h3>
            <ChipGroup label="Already paid" value={paid} onChange={setPaid} options={PAID} describedBy={errors.paid ? 'nb-paid-error' : undefined} />
            {errors.paid && <p className="field-error" id="nb-paid-error">{errors.paid}</p>}
            {paid !== 'None' && (
              <div className="nb-row">
                <span className="nb-row-label">Paid by</span>
                <ChipGroup label="Paid by" value={method} onChange={setMethod} options={METHODS} />
              </div>
            )}
            {paid !== 'None' && method !== 'Cash' && (
              <TextField label="Reference (optional)" maxLength={50} value={reference} error={errors.paymentReference} onChange={(e) => setReference(e.target.value)} />
            )}
          </section>
        </form>

        {/* The booking as it stands, with the money always in view. */}
        <aside className="nb-summary" aria-label="Booking summary">
          <h3>Summary</h3>
          <p className="nb-sum-client">{guest.name.trim() || <span className="nb-sum-empty">No name yet</span>}<small>{source}</small></p>
          {!service ? (
            <p className="nb-sum-empty">Pick a service to see the total.</p>
          ) : (
            <>
              <ul className="nb-sum-lines">
                {isSet && removal && <li><span>Removal first: {removal.name}</span><Money amount={removal.price} /></li>}
                <li><span>{chosenSet ? (withDesign ? withDesignName(chosenSet.base) : chosenSet.base.name) : `Removal only: ${service.name}`}</span><Money amount={service.price} /></li>
                {chosenAddOns.map(({ addOn, nailCount }) => (
                  <li key={addOn.id}><span>{addOn.name} × {nailCount}</span><Money amount={addOn.price * nailCount} /></li>
                ))}
              </ul>
              <p className="nb-sum-when">{formatDate(date)}{time ? ` · ${formatTime(time)}` : ' · time not chosen'}</p>
              <dl className="nb-sum-total">
                <div><dt>Total</dt><dd><Money amount={quote.total} /></dd></div>
                <div><dt>Paid now</dt><dd><Money amount={paidNow} /></dd></div>
                <div className="is-due"><dt>Left at the salon</dt><dd><Money amount={leftToPay} /></dd></div>
              </dl>
            </>
          )}
        </aside>
      </div>
    </Modal>
  )
}
