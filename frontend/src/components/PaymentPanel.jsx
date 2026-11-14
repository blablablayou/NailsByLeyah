import { useRef, useState } from 'react'
import { LegalDocumentModal } from './Modal'
import { Alert, Button, Money, StatusBadge } from './ui'
import { useSalon } from './SalonProfile'

const Icon = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
)
/** A green circled tick (the review points and the "Policy reviewed" line). */
const CheckIcon = ({ className = 'pay-review-check' }) => <Icon className={className}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></Icon>
/** An open book, on "Read Booking & Payment Policy". */
const BookIcon = () => <Icon className="pay-read-icon"><path d="M12 6.5C10.3 5.2 7.8 4.6 4 4.6v13.2c3.8 0 6.3.6 8 1.9 1.7-1.3 4.2-1.9 8-1.9V4.6c-3.8 0-6.3.6-8 1.9z" /><path d="M12 6.5v13.2" /></Icon>

// The wallets' own logos (frontend/public/img), so clients recognise them at a glance.
const WALLET_LOGOS = { GCash: '/img/wallet-gcash.png', Maya: '/img/wallet-maya.jpg' }

const METHODS = [
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
]

/** What the client pays now for each option. The server works out the same amounts; it never takes them from here. */
export const amountNow = (quote, option) => (option === 'Full' ? quote.fullAmount : quote.deposit)
export const balanceAfter = (quote, option) => Math.max(0, quote.total - amountNow(quote, option))

/**
 * Payment step: deposit or full payment, then GCash or Maya, then three points to review. "Read Booking & Payment
 * Policy" opens the whole policy; once it has been read to the end, the agreement checkbox unlocks, and the client ticks
 * it themself (never ticked for them). The Pay button stays disabled until it is ticked (Ref 2.3), for either option,
 * and the server refuses a booking without the current Terms version. Pay is disabled with a loading state from the
 * first click until the server answers, so only one request is ever sent (Ref 12.4). The booking then waits for
 * Leyah's confirmation.
 */
export function PaymentPanel({ quote, option, onOptionChange, onPay, error }) {
  const [method, setMethod] = useState(null) // nothing is picked for the client: they choose
  const { paymentAccountName } = useSalon()
  const [understood, setUnderstood] = useState(false) // the agreement checkbox
  const [policyRead, setPolicyRead] = useState(false) // the policy was opened and read to the end: unlocks the checkbox
  const [paying, setPaying] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const inFlight = useRef(false)

  const ready = Boolean(option && method && understood)
  const pay = async () => {
    if (inFlight.current || !ready) return
    inFlight.current = true
    setPaying(true)
    try {
      await onPay(method)
    } finally {
      inFlight.current = false
      setPaying(false)
    }
  }

  const options = [
    { value: 'Deposit', title: 'Booking deposit', note: <>Pay the rest (<Money amount={balanceAfter(quote, 'Deposit')} />) at the salon</> },
    { value: 'Full', title: 'Full payment', note: <>Nothing left to pay at the salon</> },
  ]

  return (
    <div className="payment-panel">
      <fieldset className="method-fieldset" disabled={paying}>
        <legend className="pay-step-title"><i aria-hidden="true">1</i> How much would you like to pay now?</legend>
        <div className="pay-options">
          {options.map((o) => (
            <label key={o.value} className={option === o.value ? 'pay-option selected' : 'pay-option'}>
              <input type="radio" name="payment-option" value={o.value} checked={option === o.value}
                onChange={() => onOptionChange(o.value)} aria-label={o.title} />
              <span className="pay-option-title">{o.title}</span>
              <span className="pay-option-amount"><Money amount={amountNow(quote, o.value)} /></span>
              <span className="pay-option-note">{o.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="method-fieldset" disabled={paying}>
        <legend className="pay-step-title"><i aria-hidden="true">2</i> Pay with</legend>
        <div className="method-options">
          {METHODS.map((m) => (
            <label key={m.value} className={method === m.value ? 'method-option selected' : 'method-option'}>
              <input type="radio" name="payment-method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} aria-label={m.label} />
              <span className={`wallet-mark wallet-mark-${m.value.toLowerCase()}`} aria-hidden="true">
                <img src={WALLET_LOGOS[m.value]} alt="" width="36" height="36" />
              </span>
              <span className="method-text">
                <span className={`wallet wallet-${m.value.toLowerCase()}`}>{m.label}</span>
                <span className="muted small">E-wallet</span>
              </span>
            </label>
          ))}
        </div>
        {paymentAccountName && <p className="pay-to muted small">Account name: <strong>{paymentAccountName}</strong></p>}
      </fieldset>

      <div>
        <div className="pay-step-title"><i aria-hidden="true">3</i> Review and agree</div>
        {/* Three points to review, the full policy to read, then the client's own agreement. */}
        <div className={understood ? 'pay-review is-done' : 'pay-review'}>
          <p className="pay-review-title">Before proceeding, please review:</p>
          <ul className="pay-review-list">
            <li><CheckIcon /><span>A <Money amount={quote.deposit} /> deposit is required to secure the appointment request.</span></li>
            <li><CheckIcon /><span>Your appointment is subject to payment verification and salon confirmation.</span></li>
            <li><CheckIcon /><span>Cancellation, refund, and rescheduling rules apply.</span></li>
          </ul>
          <button type="button" className="pay-read" onClick={() => setShowPolicy(true)} disabled={paying}>
            <BookIcon /> Read Booking &amp; Payment Policy
          </button>
          {/* The agreement and its status line, kept together. */}
          <div className="pay-ack-group">
            <div className={policyRead ? 'pay-ack' : 'pay-ack is-locked'}>
              <input type="checkbox" id="pay-ack" checked={understood} onChange={(e) => setUnderstood(e.target.checked)}
                disabled={paying || !policyRead} aria-describedby="pay-ack-status" />
              <label htmlFor="pay-ack">
                I have read and agree to the <strong>Booking Terms, Payment Policy, and Cancellation &amp; Refund Policy</strong>.
              </label>
            </div>
            <p className={policyRead ? 'pay-ack-status is-read' : 'pay-ack-status'} id="pay-ack-status" aria-live="polite">
              {policyRead ? <><CheckIcon className="pay-ack-status-icon" />{understood ? 'Policy reviewed and agreed.' : 'Policy reviewed. Please check the agreement box to continue.'}</>
                : 'Read the policy to the end to unlock the agreement.'}
            </p>
          </div>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {paying && (
        <div className="pending-note" role="status">
          <StatusBadge status="Pending" /> Waiting for {method} to confirm your payment…
        </div>
      )}

      <Button onClick={pay} disabled={!ready} loading={paying} className="btn-lg pay-button">
        <svg className="pay-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" /></svg>
        {option ? <>Pay <Money amount={amountNow(quote, option)} />{option === 'Full' ? ' in full' : ' deposit'}</> : 'Pay'}
      </Button>
      <p className="pay-note muted small">
        {!option ? 'Choose how much to pay now (step 1) to continue.'
          : !method ? 'Choose GCash or Maya (step 2) to continue.'
            : !policyRead ? 'Read the Booking & Payment Policy (step 3) to continue.'
              : !understood ? 'Check the agreement box (step 3) to continue.'
              : 'You get a receipt right away. Leyah then checks the payment and confirms your appointment.'}
      </p>
      {/* The whole policy; reading it to the end unlocks the agreement checkbox above. */}
      {showPolicy && <LegalDocumentModal document="booking" onClose={() => setShowPolicy(false)} onReadToEnd={() => setPolicyRead(true)} />}
    </div>
  )
}
