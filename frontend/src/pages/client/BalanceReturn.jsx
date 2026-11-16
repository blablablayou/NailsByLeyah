import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { errorMessage } from '../../api/errors'
import { formatDate, formatTime } from '../../lib/format'
import { Alert, Card, Money, PageHeader, PageLoader } from '../../components/ui'

const CHECK_EVERY_MS = 3_000
const CHECK_FOR_MS = 60_000

/**
 * Back from paying the balance online. Only the server says whether it's paid: this asks every few seconds for about a
 * minute, then says what happened. Nothing was held, so leaving without paying just leaves the balance due.
 */
export function BalanceReturn({ bookingId }) {
  const [state, setState] = useState({ kind: 'checking' }) // checking | paid | notPaid | slow | error
  const startedAt = useRef(0)

  useEffect(() => {
    let stopped = false
    let timer
    startedAt.current = Date.now()
    const run = async () => {
      try {
        const status = await api.bookings.balanceStatus(bookingId)
        if (stopped) return
        if (status.status === 'Paid') {
          setState({ kind: 'paid', booking: await api.bookings.get(bookingId) })
          return
        }
        if (status.status === 'NotCompleted') {
          setState({ kind: 'notPaid' })
          return
        }
        if (Date.now() - startedAt.current >= CHECK_FOR_MS) setState({ kind: 'slow' })
        else timer = setTimeout(run, CHECK_EVERY_MS)
      } catch (err) {
        if (stopped) return
        if (Date.now() - startedAt.current < CHECK_FOR_MS) timer = setTimeout(run, CHECK_EVERY_MS)
        else setState({ kind: 'error', message: errorMessage(err) })
      }
    }
    run()
    return () => { stopped = true; clearTimeout(timer) }
  }, [bookingId])

  if (state.kind === 'checking') return <PageLoader label="Confirming your payment… This takes a few seconds." />
  if (state.kind === 'error') return <Alert kind="error">{state.message}</Alert>

  const b = state.booking
  return (
    <div className="narrow stack">
      {state.kind === 'paid' && (
        <>
          <PageHeader title="Balance paid" subtitle="Thank you! Your booking is paid in full." />
          <Card className="payment-return">
            <p>
              {b.serviceName} on <strong>{formatDate(b.bookingDate)}</strong> at <strong>{formatTime(b.startTime)}</strong>:
              {' '}<Money amount={b.payment?.amountPaid ?? b.totalPrice} /> paid, nothing left to pay at the salon.
            </p>
            <div className="row"><Link to="/bookings" className="btn btn-primary">Go to My bookings</Link></div>
          </Card>
        </>
      )}
      {state.kind === 'notPaid' && (
        <>
          <PageHeader title="Balance not paid" subtitle="The payment wasn't completed. You have not been charged." />
          <Card className="payment-return">
            <p>Your booking is still on. You can pay the balance online again from My bookings, or at the salon.</p>
            <div className="row"><Link to="/bookings" className="btn btn-primary">Go to My bookings</Link></div>
          </Card>
        </>
      )}
      {state.kind === 'slow' && (
        <>
          <PageHeader title="Still confirming" subtitle="Still confirming your payment. It will show on My bookings once it's through." />
          <Card className="payment-return">
            <p>If you closed the payment page before paying, nothing was charged and the balance is still due.</p>
            <div className="row"><Link to="/bookings" className="btn btn-primary">Go to My bookings</Link></div>
          </Card>
        </>
      )}
    </div>
  )
}
