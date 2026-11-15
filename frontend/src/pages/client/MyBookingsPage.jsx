import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate, formatTime } from '../../lib/format'
import { hoursUntil, startsAt, today } from '../../lib/dates'
import { Alert, Button, EmptyState, Money, PageHeader, PageLoader, Spinner, StatusBadge } from '../../components/ui'
import { CancelBookingDialog, RescheduleDialog } from '../../components/BookingDialogs'
import { Modal } from '../../components/Modal'
import { Receipt } from '../../components/Receipt'
import { ReceiptDownload } from '../../components/ReceiptDownload'
import { canDownloadReceipt } from '../../lib/receiptPdf'
import { colorLabel, colorRequestLabel, perNailText } from '../../lib/shades'
import { ReferenceImageGallery } from '../../components/ReferenceImageGallery'
import { clearBookingDraft, draftHasProgress, loadBookingDraft } from '../../lib/bookingDraft'
import { downloadIcs } from '../../lib/calendar'

const RESCHEDULE_HOURS = 24

const isActive = (b) => b.status === 'Pending' || b.status === 'Confirmed'
const isUpcoming = (b) => isActive(b) && startsAt(b.bookingDate, b.startTime) > new Date()
// Cancelled and no-show bookings are one tab; everything else that is over (normally Completed) is the other.
const isCancelled = (b) => b.status === 'Cancelled' || b.status === 'NoShow'
const TABS = [
  { value: 'upcoming', label: 'Upcoming', empty: 'No upcoming appointments' },
  { value: 'completed', label: 'Completed', empty: 'No completed appointments yet' },
  { value: 'cancelled', label: 'Cancelled', empty: 'No cancelled bookings' },
]

/** A client has had a successful visit once any booking is Completed; "Book again" and "Rate us" wait for that. */
export const hasCompletedVisit = (bookings) => bookings.some((b) => b.status === 'Completed')

/** Booking history with statuses, reschedule and cancel (Ref 10.3, 10.6, 2.5). */
export default function MyBookingsPage() {
  const history = useAsync(() => Promise.all([api.bookings.history(), api.catalog.lookups(), loadBookingDraft(), api.catalog.get()]), [])
  const [tab, setTab] = useState('upcoming')
  const [dialog, setDialog] = useState(null) // { kind, booking }
  const [message, setMessage] = useState(null)

  if (history.loading && !history.data) return <PageLoader label="Loading your bookings…" />
  if (history.error) return <Alert kind="error">{errorMessage(history.error)}</Alert>

  const [bookings, lookups, draft, catalog] = history.data
  const upcoming = bookings.filter(isUpcoming).sort((a, b) => (a.bookingDate + a.startTime).localeCompare(b.bookingDate + b.startTime))
  const lists = {
    upcoming,
    completed: bookings.filter((b) => !isUpcoming(b) && !isCancelled(b)),
    cancelled: bookings.filter((b) => !isUpcoming(b) && isCancelled(b)),
  }
  const shown = lists[tab]

  const done = (text) => {
    setDialog(null)
    setMessage(text)
    history.reload()
  }

  return (
    <div className="stack">
      <PageHeader title="My bookings" actions={hasCompletedVisit(bookings) ? <Link to="/book" className="btn btn-primary">Book again</Link> : null} />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {draftHasProgress(draft) && (
        <DraftCard draft={draft} catalog={catalog} onDiscard={async () => { await clearBookingDraft(); history.reload() }} />
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={tab === t.value ? 'tab active' : 'tab'}
            onClick={() => setTab(t.value)}>{t.label} ({lists[t.value].length})</button>
        ))}
        {history.loading && <Spinner small label="Refreshing" />}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={TABS.find((t) => t.value === tab).empty}>
          {tab === 'upcoming' && <Link to="/book">Book an appointment</Link>}
        </EmptyState>
      ) : (
        <ul className="booking-cards">
          {shown.map((b) => (
            <BookingCard key={b.id} booking={b} onAction={(kind) => setDialog({ kind, booking: b })} />
          ))}
        </ul>
      )}

      {dialog?.kind === 'cancel' && (
        <CancelBookingDialog booking={dialog.booking} reasons={lookups.clientCancellationReasons} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api.bookings.cancel(dialog.booking.id, body)
            done('Your booking has been cancelled.')
          }} />
      )}
      {dialog?.kind === 'reschedule' && (
        <RescheduleDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const moved = await api.bookings.reschedule(dialog.booking.id, body)
            done(`Rescheduled to ${formatDate(moved.bookingDate)} at ${formatTime(moved.startTime)}.`)
          }} />
      )}
      {dialog?.kind === 'receipt' && <ReceiptDialog booking={dialog.booking} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** An unfinished booking. It isn't an appointment yet, so it gets its own "Draft" label and no time is held for it. */
function DraftCard({ draft, catalog, onDiscard }) {
  const [discarding, setDiscarding] = useState(false)
  const service = catalog.services.find((s) => s.id === draft.serviceId)
  const removal = catalog.services.find((s) => s.id === draft.removalId)
  // A Plain set takes no add-ons, so any left in an older draft aren't counted.
  const addOnCount = service?.allowsAddOns ? Object.keys(draft.nails ?? {}).length : 0
  const what = [service?.name, removal && `Removal (${removal.name})`].filter(Boolean).join(' + ')
  return (
    <section className="draft-card" aria-label="Unfinished booking">
      <div>
        <div className="draft-card-head">
          <span className="badge badge-draft">Draft</span>
          <strong>{what || 'Service not chosen yet'}</strong>
          {addOnCount > 0 && <span className="muted small">+ {addOnCount} add-on{addOnCount === 1 ? '' : 's'}</span>}
        </div>
        <p className="muted small">
          {draft.date && draft.time ? `${formatDate(draft.date)}, ${formatTime(draft.time)} · ` : ''}
          Not booked yet: the time isn&apos;t held until you pay the deposit.
        </p>
      </div>
      <div className="row">
        <Button variant="ghost" size="sm" loading={discarding} onClick={async () => { setDiscarding(true); await onDiscard() }}>Discard</Button>
        <Link to="/book" className="btn btn-primary btn-sm">Continue booking</Link>
      </div>
    </section>
  )
}

/** "Today", "Tomorrow", "In 5 days" for an upcoming appointment. */
function daysLeft(date) {
  const days = Math.round((new Date(`${date}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
}

/** Add-ons grouped by hand: "Left hand: French Tip × 5, Cat Eye Polish × 5". */
function addOnsByHand(addOns) {
  const groups = new Map()
  for (const a of addOns) groups.set(a.handLabel, [...(groups.get(a.handLabel) ?? []), a])
  return [...groups]
}

function BookingCard({ booking: b, onAction }) {
  const upcoming = isUpcoming(b)
  const inTime = hoursUntil(b.bookingDate, b.startTime) >= RESCHEDULE_HOURS
  const usedUp = b.rescheduleLimit > 0 && b.rescheduleCount >= b.rescheduleLimit
  const canReschedule = upcoming && inTime && !usedUp
  const day = new Date(`${b.bookingDate}T00:00:00`)
  const closed = b.status === 'NoShow' || b.status === 'Cancelled'
  return (
    <li className="booking-card" aria-label={`${formatDate(b.bookingDate)} · ${formatTime(b.startTime)}`}>
      <div className="booking-card-head">
        {/* A small calendar leaf: the day, month and weekday at a glance. */}
        <span className="booking-date" aria-hidden="true">
          <span className="booking-date-month">{day.toLocaleDateString('en-PH', { month: 'short' })}</span>
          <span className="booking-date-day">{day.getDate()}</span>
          <span className="booking-date-week">{day.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
        </span>
        <div className="booking-card-title">
          <div className="booking-when">{formatDate(b.bookingDate)} · {formatTime(b.startTime)}</div>
          <div className="booking-what">{b.serviceName}{b.removalServiceName && ` + Removal (${b.removalServiceName})`}</div>
          {upcoming && <span className="booking-countdown">{daysLeft(b.bookingDate)}</span>}
        </div>
        <StatusBadge status={b.status} />
      </div>

      {(b.nailColor || b.perNailColors || b.colorRequest || b.addOns.length > 0) && (
        <div className="booking-card-details">
          {b.nailColor && <div className="muted small">Colour: {colorLabel(b.nailColor)}</div>}
          {b.perNailColors && <div className="muted small">Each nail: {perNailText(b.perNailColors)}</div>}
          {b.colorRequest && (
            <div className="muted small">
              Colour: {b.colorRequest} <span className={`color-request-badge is-${(b.colorRequestStatus ?? 'Pending').toLowerCase()}`}>{colorRequestLabel(b.colorRequestStatus)}</span>
            </div>
          )}
          {b.addOns.length > 0 && (
            <ul className="booking-addons" aria-label="Add-ons">
              {addOnsByHand(b.addOns).map(([hand, items]) => (
                <li key={hand}>
                  <span className="booking-addons-hand">{hand}</span>
                  <span>{items.map((a) => `${a.name} × ${a.nailCount}`).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <dl className="booking-money" role="group" aria-label="Payment">
        <div><dt>Total</dt><dd><Money amount={b.totalPrice} /></dd></div>
        <div><dt>Paid</dt><dd><Money amount={b.payment?.amountPaid ?? b.depositAmount} /> <small>{b.payment?.option === 'Full' ? '(full)' : '(deposit)'}</small></dd></div>
        {!closed && <div><dt>Balance</dt><dd><Money amount={b.balanceDue} /></dd></div>}
      </dl>

      {b.note && <p className="booking-note"><span className="booking-note-label">Note</span> <span>{b.note}</span></p>}
      <ReferenceImageGallery images={b.referenceImages} />
      {b.cancellation && (
        <p className="muted small">
          Cancelled by {b.cancellation.cancelledByRole === 'Administrator' ? 'the salon' : 'you'}: {b.cancellation.reasonLabel}
          {b.cancellation.explanation && ` — ${b.cancellation.explanation}`}
        </p>
      )}
      {b.payment?.refundDue > 0 && (
        <p className={b.payment.refundSentAt ? 'refund-line sent' : 'refund-line'}>
          Refund <Money amount={b.payment.refundDue} />:{' '}
          {b.payment.refundSentAt ? `sent on ${new Date(b.payment.refundSentAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Leyah will send it to the account you paid from.'}
        </p>
      )}
      <div className="booking-card-actions">
        <Button variant="ghost" size="sm" onClick={() => onAction('receipt')}>Receipt</Button>
        {upcoming && (
          <>
            <Button variant="ghost" size="sm" onClick={() => downloadIcs(b)}>Add to calendar</Button>
            <span className="booking-card-actions-end">
              <Button variant="secondary" size="sm" disabled={!canReschedule} onClick={() => onAction('reschedule')}>Reschedule</Button>
              <Button variant="danger-ghost" size="sm" onClick={() => onAction('cancel')}>Cancel</Button>
            </span>
          </>
        )}
      </div>
      {upcoming && usedUp && (
        <p className="hint-text">You&apos;ve rescheduled this appointment {b.rescheduleLimit} times, the most allowed. Message Leyah if you need to move it again.</p>
      )}
      {upcoming && !usedUp && !inTime && (
        <p className="hint-text">Rescheduling is only possible at least 24 hours before your appointment.</p>
      )}
      {upcoming && !usedUp && b.rescheduleCount > 0 && inTime && (
        <p className="hint-text">Rescheduled {b.rescheduleCount} of {b.rescheduleLimit} times.</p>
      )}
    </li>
  )
}

function ReceiptDialog({ booking, onClose }) {
  const receipt = useAsync(() => api.bookings.receipt(booking.id), [booking.id])
  return (
    <Modal title="Payment receipt" onClose={onClose}
      footer={(
        // Download (with why it's off, above it) on the left, Close on the right, level with Download.
        <div className="receipt-foot">
          {receipt.data && (
            <div className="receipt-foot-left">
              {!canDownloadReceipt(receipt.data) && <p className="muted small receipt-foot-hint">PDF available once Leyah verifies your payment.</p>}
              <ReceiptDownload receipt={receipt.data} showHint={false} />
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      )}>
      {receipt.loading && <PageLoader />}
      {receipt.error && <Alert kind="error">{errorMessage(receipt.error)}</Alert>}
      {receipt.data && <Receipt receipt={receipt.data} booking={booking} />}
    </Modal>
  )
}
