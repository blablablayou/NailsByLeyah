import { Link } from 'react-router'
import { formatDate, formatTime } from '../lib/format'
import { Card, PageHeader } from './ui'
import { Receipt } from './Receipt'

/** "Booking received!": the paid booking and its receipt, after paying (straight away, or back from Xendit's page). */
export function BookingReceived({ booking, receipt }) {
  return (
    <div className="narrow stack">
      <PageHeader title="Booking received!"
        subtitle={`Your payment went through. Leyah will confirm your ${formatDate(booking.bookingDate)}, ${formatTime(booking.startTime)} appointment shortly.`} />
      <Card>
        <Receipt receipt={receipt} booking={booking} />
      </Card>
      <div className="row">
        <Link to="/bookings" className="btn btn-primary">Go to my bookings</Link>
        <Link to="/" className="btn btn-secondary">Back to home</Link>
      </div>
    </div>
  )
}
