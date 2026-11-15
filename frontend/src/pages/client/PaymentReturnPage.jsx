import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../../api'
import { errorMessage } from '../../api/errors'
import { formatClock, formatMoney } from '../../lib/format'
import { goToExternal } from '../../lib/navigation'
import { BookingReceived } from '../../components/BookingReceived'
import { CancelBookingDialog } from '../../components/BookingDialogs'
import { Alert, Button, Card, PageHeader, PageLoader } from '../../components/ui'

const CHECK_EVERY_MS = 3_000
const CHECK_FOR_MS = 60_000

/**
 * Where the client lands back from Xendit's page (paid, or left it). Only the server says whether it's paid: this page
 * asks every few seconds for about a minute, then explains what's happening and what they can do.
 */
export default function PaymentReturnPage() {
  const [params] = useSearchParams()
  const bookingId = Number(params.get('booking'))
  const [state, setState] = useState({ kind: 'checking' }) // checking | paid | slow | notCompleted | error
  const [action, setAction] = useState(null) // 'retry' | 'cancel'
  const [error, setError] = useState(null)
  const startedAt = useRef(0)

  const check = useCallback(async () => {
    const status = await api.bookings.paymentStatus(bookingId)
    if (status.status === 'Paid') {
      const [booking, receipt] = await Promise.all([api.bookings.get(bookingId), api.bookings.receipt(bookingId)])
      return { kind: 'paid', booking, receipt }
    }
    if (status.status === 'NotCompleted') return { kind: 'notCompleted' }
    if (status.status === 'PaidRefundDue') return { kind: 'refundDue', amount: status.amount }
    return Date.now() - startedAt.current >= CHECK_FOR_MS ? { kind: 'slow', holdUntil: status.holdUntil } : null
  }, [bookingId])

  useEffect(() => {
    let stopped = false
    startedAt.current = Date.now()
    let timer
    const run = async () => {
      try {
        const next = await check()
        if (stopped) return
        if (next) setState(next)
        else timer = setTimeout(run, CHECK_EVERY_MS)
      } catch (err) {
        if (stopped) return
        // A passing problem (network, the server restarting): keep trying for the rest of the minute.
        if (Date.now() - startedAt.current < CHECK_FOR_MS) timer = setTimeout(run, CHECK_EVERY_MS)
        else setState({ kind: 'error', message: errorMessage(err) })
      }
    }
    run()
    return () => { stopped = true; clearTimeout(timer) }
  }, [check])

  const tryAgain = async () => {
    setError(null)
    setAction('retry')
    try {
      const { checkoutUrl } = await api.bookings.retryCheckout(bookingId)
      goToExternal(checkoutUrl)
    } catch (err) {
      setError(errorMessage(err))
      setAction(null)
    }
  }

  if (!bookingId) return <Alert kind="error">This payment link is missing its booking. Open it from My bookings.</Alert>
  if (state.kind === 'paid') return <BookingReceived booking={state.booking} receipt={state.receipt} />
  if (state.kind === 'checking') return <PageLoader label="Confirming your payment… This takes a few seconds." />

  return (
    <div className="narrow stack">
      {state.kind === 'slow' && (
        <>
          <PageHeader title="Still confirming" subtitle="Still confirming. We'll email you once it's through." />
          <Card className="payment-return">
            <p>
              If you closed Xendit&apos;s page before paying, you can pay now
              {state.holdUntil ? <> — your time is held until <strong>{formatClock(state.holdUntil)}</strong></> : null}.
            </p>
            {error && <Alert kind="error">{error}</Alert>}
            <div className="row">
              <Button onClick={tryAgain} loading={action === 'retry'}>Try again</Button>
              <Button variant="secondary" onClick={() => setAction('cancel')} disabled={action === 'retry'}>Cancel booking</Button>
            </div>
            <Link to="/bookings">Go to My bookings</Link>
          </Card>
        </>
      )}
      {state.kind === 'notCompleted' && (
        <>
          <PageHeader title="Payment not completed" subtitle="The payment wasn't completed. You have not been charged." />
          <Card className="payment-return">
            <p>The time we held for you has been released. You can book again whenever you&apos;re ready.</p>
            <div className="row">
              <Link to="/book" className="btn btn-primary">Book again</Link>
              <Link to="/bookings" className="btn btn-secondary">Go to My bookings</Link>
            </div>
          </Card>
        </>
      )}
      {state.kind === 'refundDue' && (
        <>
          <PageHeader title="Payment received" subtitle={`We received ${formatMoney(state.amount)}, but couldn't keep this time for you.`} />
          <Card className="payment-return">
            <p>The booking had already been cancelled or its time was taken before the payment came through. Leyah will refund
              the full amount to the account you paid from — you don&apos;t need to do anything.</p>
            <div className="row">
              <Link to="/bookings" className="btn btn-primary">Go to My bookings</Link>
              <Link to="/book" className="btn btn-secondary">Book another time</Link>
            </div>
          </Card>
        </>
      )}
      {state.kind === 'error' && <Alert kind="error">{state.message}</Alert>}
      {action === 'cancel' && (
        <CancelHold bookingId={bookingId} onClose={() => setAction(null)}
          onCancelled={() => setState({ kind: 'notCompleted' })} />
      )}
    </div>
  )
}

/** The usual cancel dialog (with its reasons), for a booking that was never paid. */
function CancelHold({ bookingId, onClose, onCancelled }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    Promise.all([api.bookings.get(bookingId), api.catalog.lookups()]).then(([booking, lookups]) => setData({ booking, lookups }))
  }, [bookingId])
  if (!data) return null
  return (
    <CancelBookingDialog booking={data.booking} reasons={data.lookups.clientCancellationReasons} onClose={onClose}
      onSubmit={async (body) => {
        await api.bookings.cancel(bookingId, body)
        onCancelled()
      }} />
  )
}
