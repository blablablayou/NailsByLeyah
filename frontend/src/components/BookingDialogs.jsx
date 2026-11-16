import { useState } from 'react'
import { Modal } from './Modal'
import { SlotPicker } from './SlotPicker'
import { Alert, Button, Field, Money, SelectField } from './ui'
import { errorMessage, fieldErrors } from '../api/errors'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { LIMITS } from '../validation/rules'
import { amountPaid, depositKept, refundFor } from '../lib/refunds'
import { bookingClientName } from '../lib/bookingClient'

/**
 * Cancellation dialog. Clients pick from their reasons (Ref 2.5), and "Others" asks them to write theirs;
 * administrators pick from theirs and may add an optional explanation (Ref 3.1, 3.2).
 */
export function CancelBookingDialog({ booking, reasons, allowExplanation = false, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)
  const [explanationError, setExplanationError] = useState(null)
  // A client choosing "Others" must say why; the listed reasons need no words.
  const ownReason = !allowExplanation && reason === 'Others'

  const submit = async (e) => {
    e.preventDefault()
    if (!reason) {
      setFieldError('Select a cancellation reason.')
      return
    }
    if (ownReason && !explanation.trim()) {
      setExplanationError('Please tell us the reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(allowExplanation || ownReason ? { reason, explanation: explanation.trim() || null } : { reason })
    } catch (err) {
      setError(errorMessage(err))
      setFieldError(fieldErrors(err).reason ?? null)
      setExplanationError(fieldErrors(err).explanation ?? null)
      setSaving(false)
    }
  }

  return (
    <Modal title="Cancel booking" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {booking.serviceName} on <strong>{formatDate(booking.bookingDate)}</strong> at {formatTime(booking.startTime)}
        </p>
        <RefundNote booking={booking} bySalon={allowExplanation} reason={reason} />
        {error && <Alert kind="error">{error}</Alert>}
        <SelectField label="Reason for cancelling" required value={reason} placeholder="Select a reason"
          options={reasons} error={fieldError} onChange={(e) => { setReason(e.target.value); setFieldError(null); setExplanationError(null) }} />
        {ownReason && (
          <Field label="Your reason" required error={explanationError} counter={`${explanation.length}/${LIMITS.explanationMax}`}>
            {(aria) => (
              <textarea className="input" rows={3} maxLength={LIMITS.explanationMax} value={explanation} required autoFocus
                placeholder="e.g. I have to travel that week" onChange={(e) => { setExplanation(e.target.value); setExplanationError(null) }} {...aria} />
            )}
          </Field>
        )}
        {allowExplanation && (
          <Field label="Explanation (optional)" hint={`${explanation.length}/${LIMITS.explanationMax}`}>
            {(aria) => (
              <textarea className="input" rows={3} maxLength={LIMITS.explanationMax} value={explanation}
                onChange={(e) => setExplanation(e.target.value)} {...aria} />
            )}
          </Field>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Keep booking</Button>
          <Button type="submit" variant="danger" loading={saving}>Cancel booking</Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Records the balance a client paid after the service. When completing a booking (`completing`), Leyah can also say
 * it hasn't been paid yet and record it later from the booking's menu. Always the whole balance.
 */
export function BalanceDialog({ booking, completing = false, onSubmit, onClose }) {
  const [received, setReceived] = useState(true)
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setFieldError(null)
    try {
      await onSubmit({ received, reference: reference.trim() || null })
    } catch (err) {
      const problem = fieldErrors(err).balanceReference
      if (problem) setFieldError(problem)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={completing ? 'Complete booking' : 'Record balance'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {bookingClientName(booking)}, {booking.serviceName}<br />
          Balance: <strong><Money amount={booking.balanceDue} /></strong>
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        {completing && (
          <fieldset className="balance-options">
            <legend className="sr-only">Has the balance been paid?</legend>
            <label className={received ? 'balance-option selected' : 'balance-option'}>
              <input type="radio" name="balance-received" checked={received} onChange={() => setReceived(true)} />
              <span>Balance received</span>
            </label>
            <label className={received ? 'balance-option' : 'balance-option selected'}>
              <input type="radio" name="balance-received" checked={!received} onChange={() => setReceived(false)} />
              <span>Not paid yet</span>
            </label>
          </fieldset>
        )}
        {received ? (
          <Field label="GCash reference (optional)" error={fieldError}>
            {(aria) => <input className="input" maxLength={LIMITS.balanceReferenceMax} value={reference} onChange={(e) => setReference(e.target.value)} {...aria} />}
          </Field>
        ) : (
          <p className="muted small">The balance stays on the booking and in Reports until you record it from the booking&apos;s menu.</p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving}>{completing ? 'Complete booking' : 'Record balance'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** What happens to the money if this booking is cancelled now, worded for whoever is cancelling. */
function RefundNote({ booking, bySalon, reason }) {
  if (booking.status === 'AwaitingPayment')
    return <Alert kind="info">Nothing has been charged. The time held for you will be released.</Alert>
  const paid = amountPaid(booking)
  const refund = refundFor(booking, { bySalon, reason })
  if (bySalon) {
    if (!paid) return null
    if (reason === 'ClientDidNotRespond') {
      return (
        <Alert kind="info">
          The client keeps the usual rule: the <Money amount={depositKept(booking)} /> deposit is kept
          {refund > 0 ? <>, and <Money amount={refund} /> is refunded.</> : ', and nothing is refunded.'}
        </Alert>
      )
    }
    return (
      <Alert kind="info">
        The salon is cancelling, so the client gets back everything they paid: <strong><Money amount={paid} /></strong>, the deposit
        included. Send it by GCash or Maya, then record it from the booking&apos;s menu.
      </Alert>
    )
  }
  return refund > 0 ? (
    <Alert kind="info">
      You paid <Money amount={paid} />. The <Money amount={depositKept(booking)} /> deposit is non-refundable, so <strong><Money amount={refund} /></strong> will
      be refunded to the account you paid from.
    </Alert>
  ) : (
    <Alert kind="warning">The <Money amount={booking.depositAmount} /> booking deposit is non-refundable, so nothing is refunded.</Alert>
  )
}

/**
 * The refund owed after a cancellation or no-show. Paid online: Leyah sends it back to the client's GCash or Maya in one
 * click, and it shows as processing until the payment service says it arrived. Otherwise, or if that didn't go through,
 * she sends it herself and records it (the reference is optional). The payment service is never named here.
 */
export function RefundDialog({ booking, onSubmit, onRefundOnline, onCheck, onSettled, onClose }) {
  const [current, setCurrent] = useState(booking)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(null) // 'online' | 'check' | 'manual'
  const [checkedAt, setCheckedAt] = useState(null)
  const [reference, setReference] = useState('')
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)

  const pay = current.payment ?? {}
  const amount = pay.refundDue ?? 0
  const method = pay.method === 'Maya' ? 'Maya' : 'GCash'
  const status = pay.refundStatus ?? null
  const online = Boolean(pay.canRefundOnline) && status !== 'Succeeded'
  const kept = Math.max(0, (pay.amountPaid ?? 0) - amount)
  // A refund across two online payments that stopped halfway: part of it has already gone back.
  const alreadyOnline = status === 'Succeeded' ? 0 : pay.refundedOnline ?? 0
  const left = amount - alreadyOnline
  const sentMessage = `Refund of ${formatMoney(amount)} for booking #${current.id}`

  const close = () => {
    if (!changed) return onClose()
    if (status === 'Succeeded') return onSettled(`${sentMessage} sent back to their ${method}.`)
    if (status === 'Processing') return onSettled(`${sentMessage} is processing.`)
    return onSettled(null)
  }

  const run = async (kind, action) => {
    setBusy(kind)
    setError(null)
    try {
      const updated = await action()
      setCurrent(updated)
      setChanged(true)
      if (kind === 'check') setCheckedAt(new Date())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const recordByHand = async (e) => {
    e.preventDefault()
    setBusy('manual')
    setError(null)
    setFieldError(null)
    try {
      await onSubmit({ refundReference: reference.trim() || null })
    } catch (err) {
      const problem = fieldErrors(err).refundReference
      if (problem) setFieldError(problem)
      else setError(errorMessage(err))
      setBusy(null)
    }
  }

  const manualForm = (
    <form onSubmit={recordByHand} noValidate className="stack refund-manual">
      <Field label="GCash or Maya reference (optional)" error={fieldError}>
        {(aria) => <input className="input" maxLength={LIMITS.balanceReferenceMax} value={reference} onChange={(e) => setReference(e.target.value)} {...aria} />}
      </Field>
      <div className="modal-actions">
        {!pay.canRefundOnline && <Button variant="secondary" onClick={onClose} disabled={busy !== null}>Back</Button>}
        <Button type="submit" variant={pay.canRefundOnline ? 'secondary' : 'primary'} loading={busy === 'manual'} disabled={busy !== null && busy !== 'manual'}>
          Record refund sent
        </Button>
      </div>
    </form>
  )

  return (
    <Modal title={pay.canRefundOnline ? 'Send refund' : 'Record refund'} onClose={close}>
      <div className="stack">
        <p className="muted small refund-who">
          {bookingClientName(current)} · booking #{current.id} · {current.status === 'NoShow' ? 'no-show' : 'cancelled'}
        </p>
        <ul className="summary-lines refund-sum" aria-label="Refund">
          <li><span>Paid{pay.method ? ` by ${pay.method}` : ''}</span><Money amount={pay.amountPaid ?? 0} /></li>
          {kept > 0 && <li className="muted"><span>Deposit kept</span><span>−<Money amount={kept} /></span></li>}
          {alreadyOnline > 0 && <li className="muted"><span>Already sent back online</span><span>−<Money amount={alreadyOnline} /></span></li>}
          <li className="summary-total"><span>{alreadyOnline > 0 ? 'Still to refund' : 'To refund'}</span><Money amount={left} /></li>
        </ul>

        {error && <Alert kind="error">{error}</Alert>}

        {status === 'Succeeded' && (
          <>
            <Alert kind="success" title="Refund sent">
              <Money amount={amount} /> went back to their {method}.
              {pay.refundReference && <> Reference <span className="mono">{pay.refundReference}</span></>}
            </Alert>
            <div className="modal-actions"><Button onClick={close}>Done</Button></div>
          </>
        )}

        {status === 'Processing' && (
          <>
            <Alert kind="info" title="Refund processing">
              <Money amount={amount} /> is on its way back to their {method}. This can take a few minutes; you can close this
              window, and the booking will show when it&apos;s through.
            </Alert>
            {checkedAt && <p className="muted small" role="status">Still processing as of {checkedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.</p>}
            <div className="modal-actions">
              <Button variant="secondary" loading={busy === 'check'} onClick={() => run('check', onCheck)}>Check again</Button>
              <Button onClick={close} disabled={busy !== null}>Close</Button>
            </div>
          </>
        )}

        {online && status !== 'Processing' && (
          <>
            {status === 'Failed' && (
              <Alert kind="warning" title="The refund didn't go through">
                Nothing was sent. Try again, or send it yourself by GCash or Maya and record it below.
              </Alert>
            )}
            <div className="refund-online">
              <Button className="refund-send" loading={busy === 'online'} disabled={busy !== null && busy !== 'online'}
                onClick={() => run('online', onRefundOnline)}>
                Refund <Money amount={amount} /> to their {method}
              </Button>
              <p className="muted small">It goes back to the {method} account they paid from.</p>
            </div>
            <details className="refund-other" open={status === 'Failed' || undefined}>
              <summary>I sent it myself</summary>
              {manualForm}
            </details>
          </>
        )}

        {!pay.canRefundOnline && (
          <>
            <p className="muted small">Send it to the client by GCash or Maya first, then record it here.</p>
            {manualForm}
          </>
        )}
      </div>
    </Modal>
  )
}

/** A no-show can't be undone, so it is confirmed first. */
export function NoShowDialog({ booking, onSubmit, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSubmit()
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Mark as no-show" onClose={onClose}>
      <div className="stack">
        <p>
          {bookingClientName(booking)} did not come on <strong>{formatDate(booking.bookingDate)}</strong> at {formatTime(booking.startTime)}?
        </p>
        <Alert kind="warning">
          The <Money amount={depositKept(booking)} /> deposit is kept as the no-show fee.
          {refundFor(booking) > 0 && <> The rest, <Money amount={refundFor(booking)} />, is owed back to the client.</>}
          {' '}This can&apos;t be undone.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button variant="danger" loading={saving} onClick={confirm}>Mark as no-show</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Pick a new date and time for an existing booking. */
export function RescheduleDialog({ booking, onSubmit, onClose }) {
  const [date, setDate] = useState(booking.bookingDate)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!date || !time) {
      setError('Choose a new date and time.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ bookingDate: date, startTime: time })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Reschedule booking" onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="stack">
        <p className="muted">
          Currently {formatDate(booking.bookingDate)} at {formatTime(booking.startTime)}
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <SlotPicker date={date} onDateChange={setDate} selectedTime={time} onTimeChange={setTime} serviceId={booking.serviceId}
          removalServiceId={booking.removalServiceId ?? undefined}
          keepTime={date === booking.bookingDate ? booking.startTime : undefined} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving} disabled={!time}>Save new time</Button>
        </div>
      </form>
    </Modal>
  )
}
