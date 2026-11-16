import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'
import { addDays, today } from '../lib/dates'

/** Booking 8, paid by GCash on the payment page (an online payment id), then cancelled with a refund owed. */
function paidOnlineThenCancelled({ amountPaid = 300, refundDue = 300, mockRefund, ...overrides } = {}) {
  const db = getDb()
  const booking = db.bookings.find((b) => b.id === 8)
  const client = db.users.find((u) => u.id === booking.clientId)
  Object.assign(client, { firstName: 'Testa', lastName: 'Client' })
  db.bookings.filter((b) => b.id !== 8 && b.bookingDate === addDays(today(), 4)).forEach((b) => { b.isDeleted = true })
  Object.assign(booking, { bookingDate: addDays(today(), 4), startTime: '11:00:00', status: 'Cancelled', amountPaid,
    paymentOption: amountPaid > 150 ? 'Full' : 'Deposit', refundDue, refundSentAt: null, refundReference: null, refundStatus: null, ...overrides })
  db.payments.find((p) => p.bookingId === 8).referenceNumber = 'py-online-8'
  db.mockRefund = mockRefund
  saveDb()
  return booking
}

/** The dashboard's "Needs your attention" row for a booking. */
const attentionRow = (bookingId) => waitFor(() => {
  const card = screen.getByRole('heading', { name: 'Needs your attention' }).closest('section')
  const item = within(card).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name: new RegExp(`booking #${bookingId}\\.`) }))
  expect(item).toBeTruthy()
  return item
})

const openRefundFromDashboard = async (user, label = 'Send') => {
  await signIn(ADMIN)
  renderApp('/admin')
  await screen.findByRole('heading', { name: 'Dashboard' })
  await user.click(within(await attentionRow(8)).getByRole('button', { name: label }))
  return screen.getByRole('dialog')
}

describe('Sending a refund back online', () => {
  it('shows what was paid and what goes back, then sends it to their GCash and follows it until it is through', async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled()
    const dialog = await openRefundFromDashboard(user)

    expect(dialog).toHaveAccessibleName('Send refund')
    const sum = within(dialog).getByRole('list', { name: 'Refund' })
    expect(sum).toHaveTextContent('Paid by GCash₱300.00')
    expect(sum).toHaveTextContent('To refund₱300.00')
    expect(sum).not.toHaveTextContent('Deposit kept') // the salon cancelled: everything goes back

    await user.click(within(dialog).getByRole('button', { name: 'Refund ₱300.00 to their GCash' }))
    expect(await within(dialog).findByText('Refund processing')).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === 8)).toMatchObject({ refundStatus: 'Processing', refundSentAt: null })

    await user.click(within(dialog).getByRole('button', { name: 'Check again' }))
    expect(await within(dialog).findByText('Refund sent')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Refund of ₱300.00 for booking #8 sent back to their GCash.')).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === 8).refundSentAt).not.toBeNull()
  })

  it('keeps the deposit out of a client cancellation and says so', async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled({ amountPaid: 300, refundDue: 150 })
    const dialog = await openRefundFromDashboard(user)

    const sum = within(dialog).getByRole('list', { name: 'Refund' })
    expect(sum).toHaveTextContent('Deposit kept−₱150.00')
    expect(sum).toHaveTextContent('To refund₱150.00')
    expect(within(dialog).getByRole('button', { name: 'Refund ₱150.00 to their GCash' })).toBeEnabled()
  })

  it('never names the payment service, in any state', async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled({ mockRefund: 'refuse' })
    const dialog = await openRefundFromDashboard(user)
    expect(dialog.textContent).not.toMatch(/xendit/i)
    await user.click(within(dialog).getByRole('button', { name: /^Refund ₱300.00/ }))
    await within(dialog).findByText("The refund didn't go through")
    expect(dialog.textContent).not.toMatch(/xendit/i)
  })

  it("when it doesn't go through, Leyah can send it herself and record it", async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled({ mockRefund: 'refuse' })
    const dialog = await openRefundFromDashboard(user)

    await user.click(within(dialog).getByRole('button', { name: 'Refund ₱300.00 to their GCash' }))
    expect(await within(dialog).findByText("The refund didn't go through")).toBeInTheDocument()
    // "I sent it myself" opens by itself after a failed try.
    await user.type(within(dialog).getByLabelText(/GCash or Maya reference/), 'GC-BYHAND-1')
    await user.click(within(dialog).getByRole('button', { name: 'Record refund sent' }))

    expect(await screen.findByText('Refund recorded for booking #8.')).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === 8)).toMatchObject({ refundReference: 'GC-BYHAND-1', refundStatus: null })
  })

  it('"I sent it myself" stays folded until asked for', async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled()
    const dialog = await openRefundFromDashboard(user)

    const other = within(dialog).getByText('I sent it myself').closest('details')
    expect(other).not.toHaveAttribute('open')
    await user.click(within(dialog).getByText('I sent it myself'))
    expect(other).toHaveAttribute('open')
  })

  it('a refund on its way shows as processing on the dashboard, the bookings list and to the client', async () => {
    const user = userEvent.setup()
    paidOnlineThenCancelled({ refundStatus: 'Processing', refundReference: 'rfd-mock-1', mockRefund: 'pending' })
    await signIn(ADMIN)
    const { unmount } = renderApp('/admin')
    await screen.findByRole('heading', { name: 'Dashboard' })

    const item = await attentionRow(8)
    expect(item).toHaveTextContent('₱300.00 on its way back to their GCash')
    await user.click(within(item).getByRole('button', { name: 'Check' }))
    const dialog = screen.getByRole('dialog', { name: 'Send refund' })
    await user.click(within(dialog).getByRole('button', { name: 'Check again' }))
    expect(await within(dialog).findByText(/^Still processing as of/)).toBeInTheDocument()
    expect(within(dialog).queryByText('I sent it myself')).toBeNull() // nothing can be sent twice while it is on its way
    unmount()
  })
})
