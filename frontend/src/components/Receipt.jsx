import { useEffect, useRef, useState } from 'react'
import { formatDate, formatDateTime, formatTime } from '../lib/format'
import { Money, StatusBadge } from './ui'

/**
 * A small Copy button for the reference number, handy when the client messages Leyah about the payment. Where the
 * clipboard is blocked (some in-app browsers), the number is selected instead and the button says to copy it by hand.
 */
function CopyReference({ value, valueRef }) {
  const [state, setState] = useState('idle') // idle | copied | failed
  const [message, setMessage] = useState('') // for screen readers; cleared first so a second copy is announced again
  const timers = useRef([])
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false; timers.current.forEach(clearTimeout) }, [])
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  const announce = (text) => { setMessage(''); later(() => mounted.current && setMessage(text), 50) }
  const copy = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(value)
      ok = true
    } catch {
      // No clipboard here: select the number so it can be copied by hand.
      const range = document.createRange()
      if (valueRef.current) {
        range.selectNodeContents(valueRef.current)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    if (!mounted.current) return
    setState(ok ? 'copied' : 'failed')
    announce(ok ? 'Reference number copied' : 'Could not copy. The reference number is selected; copy it from there.')
    later(() => mounted.current && setState('idle'), ok ? 2000 : 4000)
  }
  return (
    <>
      <button type="button" className={state === 'failed' ? 'receipt-copy is-failed' : 'receipt-copy'} onClick={copy} aria-label="Copy reference number">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></svg>
        <span aria-hidden="true">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select & copy' : 'Copy'}</span>
      </button>
      <span className="sr-only" aria-live="polite">{message}</span>
    </>
  )
}

/**
 * Where a paid booking is: paid, then Leyah checks the payment, then the appointment is confirmed. Not shown for a
 * cancelled or no-show booking, where the status badge and the refund line say what happened.
 */
function Progress({ status, verified }) {
  const confirmed = status === 'Confirmed' || status === 'Completed'
  const checked = confirmed || verified
  const steps = [
    { label: 'Paid', done: true },
    { label: 'Leyah checks', done: checked },
    { label: 'Confirmed', done: confirmed },
  ]
  const current = checked ? 2 : 1 // the step being waited on; the last one once everything is done
  return (
    <ol className="receipt-progress" aria-label="Booking progress">
      {steps.map((s, i) => (
        <li key={s.label} className={[s.done && 'done', i === current && !s.done && 'now'].filter(Boolean).join(' ') || undefined}
          aria-current={i === current ? 'step' : undefined}>
          <span className="receipt-progress-dot" aria-hidden="true">
            {s.done && <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  )
}

/**
 * Payment receipt with the provider's reference number (Ref 12.5): the service and add-ons, what was paid (deposit
 * or full payment) and what is left. A paid booking still waits for Leyah to confirm it.
 */
export function Receipt({ receipt, booking }) {
  const status = booking?.status ?? receipt.bookingStatus
  const total = booking?.totalPrice ?? receipt.totalAmount
  const balance = booking?.balanceDue ?? receipt.balanceDue
  // A cancelled or no-show booking owes no balance; what matters is the refund, if any.
  const closed = status === 'Cancelled' || status === 'NoShow'
  const refundDue = booking?.payment?.refundDue ?? receipt.refundDue ?? 0
  const refundSentAt = booking?.payment?.refundSentAt ?? receipt.refundSentAt
  const refundReference = booking?.payment?.refundReference ?? receipt.refundReference
  const refundProcessing = (booking?.payment?.refundStatus ?? receipt.refundStatus) === 'Processing'
  const addOns = booking?.addOns ?? []
  const refValue = useRef(null)
  return (
    <div className="receipt" aria-label="Payment receipt">
      {/* The top of the slip: the tick, when it was paid, and the reference number to quote. */}
      <div className="receipt-header">
        <span className="receipt-check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
        </span>
        <div className="receipt-header-text">
          <strong>Payment received</strong>
          <div className="muted small">{formatDateTime(receipt.paidAt)}</div>
        </div>
      </div>
      <dl className="receipt-ref">
        <dt className="receipt-ref-label">Reference number</dt>
        <dd className="receipt-ref-row">
          <span className="mono receipt-ref-value" ref={refValue}>{receipt.referenceNumber}</span>
          <CopyReference value={receipt.referenceNumber} valueRef={refValue} />
        </dd>
      </dl>

      {!closed && <Progress status={status} verified={Boolean(receipt.verified)} />}

      <dl className="receipt-lines">
        <dt>Booking number</dt>
        <dd>#{receipt.bookingId}</dd>
        <dt>Payment</dt>
        {receipt.payments?.length > 1 ? (
          <dd>
            {/* The deposit, then the balance paid online: each with its own reference. */}
            <ul className="receipt-payments" aria-label="Payments">
              {receipt.payments.map((p) => (
                <li key={p.referenceNumber}>
                  <span>{p.optionLabel} via {p.method} <span className="mono muted small">{p.referenceNumber}</span></span>
                  <span className="receipt-price"><Money amount={p.amount} /></span>
                </li>
              ))}
            </ul>
          </dd>
        ) : (
          <dd>{receipt.paymentOptionLabel ?? 'Booking deposit'} via {receipt.method}</dd>
        )}
        <dt>Appointment</dt>
        <dd>{formatDate(receipt.bookingDate)}, {formatTime(receipt.startTime)}</dd>
        <dt>Service</dt>
        <dd>
          {receipt.serviceName}
          {addOns.length > 0 && (
            <ul className="receipt-addons" aria-label="Add-ons">
              {addOns.map((a) => (
                <li key={a.addOnId}>
                  <span>{a.name} — {a.handLabel} × {a.nailCount}</span>
                  <span className="receipt-price"><Money amount={a.linePrice} /></span>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Booking status</dt>
        <dd><StatusBadge status={status} /></dd>
      </dl>

      <div className="receipt-totals" role="group" aria-label="Totals">
        <dl>
          <dt>Total</dt>
          <dd><Money amount={total} /></dd>
          <dt>Amount paid</dt>
          <dd><Money amount={receipt.amountPaid || receipt.amount} /></dd>
          {closed ? (
            <>
              <dt>Refund</dt>
              <dd>
                {refundDue > 0 ? (
                  <>
                    <strong><Money amount={refundDue} /></strong>{' '}
                    <span className={refundSentAt ? 'refund-line sent' : 'refund-line'}>
                      {refundSentAt ? `sent ${formatDateTime(refundSentAt)}` : refundProcessing ? 'on its way back to the account you paid from' : 'to be sent to the account you paid from'}
                    </span>
                    {refundReference && refundSentAt && <div className="muted small">Reference <span className="mono">{refundReference}</span></div>}
                  </>
                ) : 'None (the deposit is kept)'}
              </dd>
            </>
          ) : (
            <>
              <dt className="receipt-balance">Balance due at the salon</dt>
              <dd className="receipt-balance"><strong><Money amount={balance} /></strong></dd>
            </>
          )}
        </dl>
      </div>

      <div className="receipt-notes">
        {status === 'Pending' && (
          <p className="receipt-pending" role="note">Your payment is received. Leyah will check it and confirm your appointment; you&apos;ll get an email when she does.</p>
        )}
        <p className="receipt-note" role="note">The booking deposit is non-refundable unless the salon cancels.</p>
      </div>
    </div>
  )
}
