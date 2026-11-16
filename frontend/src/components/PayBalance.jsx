import { useState } from 'react'
import { api } from '../api'
import { errorMessage } from '../api/errors'
import { goToExternal } from '../lib/navigation'
import { Alert, Button, Money } from './ui'

/**
 * "Pay balance online" on a confirmed booking: the client picks GCash or Maya and goes to the same payment page as the
 * deposit, then comes back to /bookings/payment?for=balance. Shown only when the server says it can be paid now.
 */
export function PayBalance({ booking }) {
  const [leaving, setLeaving] = useState(null) // 'GCash' | 'Maya' while the page is being made
  const [error, setError] = useState(null)

  const pay = async (method) => {
    setError(null)
    setLeaving(method)
    try {
      const { checkoutUrl } = await api.bookings.payBalance(booking.id, method)
      goToExternal(checkoutUrl)
    } catch (err) {
      setError(errorMessage(err))
      setLeaving(null)
    }
  }

  return (
    <div className="pay-balance" role="group" aria-label="Pay balance online">
      <p className="pay-balance-text">
        <strong>Pay the <Money amount={booking.balanceDue} /> balance online</strong>
        <span className="muted small">Then there&apos;s nothing left to pay at the salon.</span>
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="pay-balance-actions">
        <Button size="sm" onClick={() => pay('GCash')} loading={leaving === 'GCash'} disabled={leaving !== null}>Pay with GCash</Button>
        <Button size="sm" variant="secondary" onClick={() => pay('Maya')} loading={leaving === 'Maya'} disabled={leaving !== null}>Pay with Maya</Button>
      </div>
    </div>
  )
}
