// The refund rules from the Terms (section 7), mirrored from the server so the windows can say the amount before
// anything is canceled. The server works out and stores the real amount (refundDue) when it happens.
// - The client cancels, or does not come: the deposit is kept (it is also the late-cancellation and no-show fee) and
//   anything paid above it is refunded.
// - The salon cancels: everything paid is refunded, the deposit included; except when the client stopped answering,
//   where the client's rule applies.

export const amountPaid = (booking) => booking.payment?.amountPaid ?? 0

export const depositKept = (booking) => Math.min(amountPaid(booking), booking.depositAmount)

export function refundFor(booking, { bySalon = false, reason = null } = {}) {
  const paid = amountPaid(booking)
  if (bySalon && reason !== 'ClientDidNotRespond') return paid
  return Math.max(0, paid - booking.depositAmount)
}

/** A refund the salon still has to send (or one on its way back online). */
export const refundOwed = (booking) => (booking.payment?.refundDue ?? 0) > 0 && !booking.payment?.refundSentAt

/** On its way back to the client's GCash or Maya, waiting for the payment service to say it arrived. */
export const refundProcessing = (booking) => booking.payment?.refundStatus === 'Processing'

/** What opening the refund window does, for its menu item. */
export function refundActionLabel(booking) {
  if (refundProcessing(booking)) return 'Refund processing'
  return booking.payment?.canRefundOnline ? 'Send refund' : 'Record refund sent'
}
