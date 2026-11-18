import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'
import { goToExternal } from '../lib/navigation'

vi.mock('../lib/navigation', () => ({ goToExternal: vi.fn() }))

/** Kyla's booking five days ahead, deposit paid online and confirmed by Leyah, with the hosted payment page in use. */
function confirmedWithBalance() {
  const db = getDb()
  db.flags.xendit = true
  const booking = db.bookings.find((b) => b.id === 10)
  // Only this one is confirmed with a balance, so it's the one offer on the page.
  db.bookings.filter((b) => b.clientId === booking.clientId && b.id !== booking.id && b.status === 'Confirmed').forEach((b) => { b.status = 'Pending' })
  Object.assign(booking, { status: 'Confirmed', paymentOption: 'Deposit', amountPaid: booking.depositAmount, balanceReceived: 0 })
  saveDb()
  return booking
}

afterEach(() => vi.mocked(goToExternal).mockClear())

describe('Paying the balance online', () => {
  it('a confirmed booking with a balance offers GCash or Maya and leaves for the payment page', async () => {
    const booking = confirmedWithBalance()
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/bookings')

    const offer = await screen.findByRole('group', { name: 'Pay balance online' })
    expect(offer).toHaveTextContent(/Pay the ₱[\d,.]+ balance online/)
    await user.click(within(offer).getByRole('button', { name: 'Pay with Maya' }))

    await waitFor(() => expect(goToExternal).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/checkout\.test\/bal-10-/)))
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceCheckout.method).toBe('Maya')
  })

  it('is not offered without the online payment page, or before Leyah confirms', async () => {
    const booking = confirmedWithBalance()
    const db = getDb()
    db.flags.xendit = false
    saveDb()
    await signIn(CLIENT)
    const { unmount } = renderApp('/bookings')
    await screen.findAllByRole('group', { name: 'Payment' })
    expect(screen.queryByRole('group', { name: 'Pay balance online' })).toBeNull()
    unmount()

    const again = getDb()
    again.flags.xendit = true
    again.bookings.find((b) => b.id === booking.id).status = 'Pending'
    saveDb()
    renderApp('/bookings')
    await screen.findAllByRole('group', { name: 'Payment' })
    expect(screen.queryByRole('group', { name: 'Pay balance online' })).toBeNull()
  })

  it('coming back paid, the client sees it is paid in full', async () => {
    const booking = confirmedWithBalance()
    const user = userEvent.setup()
    await signIn(CLIENT)
    const { unmount } = renderApp('/bookings')
    await user.click(within(await screen.findByRole('group', { name: 'Pay balance online' })).getByRole('button', { name: 'Pay with GCash' }))
    await waitFor(() => expect(goToExternal).toHaveBeenCalled())
    unmount()

    const db = getDb()
    db.flags.paidBalances = [booking.id] // the payment page has the money
    saveDb()
    renderApp(`/bookings/payment?booking=${booking.id}&for=balance`)

    expect(await screen.findByRole('heading', { name: 'Balance paid' })).toBeInTheDocument()
    expect(screen.getByText(/nothing left to pay at the salon/)).toBeInTheDocument()
    const paid = getDb().payments.filter((p) => p.bookingId === booking.id && p.option === 'Balance')
    expect(paid).toHaveLength(1)
  })

  it('paying after the booking was canceled says the money was received and will be sent back', async () => {
    const booking = confirmedWithBalance()
    const user = userEvent.setup()
    await signIn(CLIENT)
    const { unmount } = renderApp('/bookings')
    await user.click(within(await screen.findByRole('group', { name: 'Pay balance online' })).getByRole('button', { name: 'Pay with GCash' }))
    await waitFor(() => expect(goToExternal).toHaveBeenCalled())
    unmount()

    const db = getDb()
    db.bookings.find((b) => b.id === booking.id).status = 'Cancelled'
    db.flags.paidBalances = [booking.id]
    saveDb()
    renderApp(`/bookings/payment?booking=${booking.id}&for=balance`)

    expect(await screen.findByRole('heading', { name: 'Payment received' })).toBeInTheDocument()
    expect(screen.getByText(/Leyah will send the full amount back/)).toBeInTheDocument()
    expect(screen.queryByText(/You have not been charged/)).not.toBeInTheDocument()
  })

  it('coming back without paying says nothing was charged and the balance is still due', async () => {
    const booking = confirmedWithBalance()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${booking.id}&for=balance`)

    expect(await screen.findByRole('heading', { name: 'Balance not paid' })).toBeInTheDocument()
    expect(screen.getByText(/You have not been charged/)).toBeInTheDocument()
  })

  it('Leyah sees what is left to send when part of a refund already went back online', async () => {
    const db = getDb()
    const booking = db.bookings.find((b) => b.id === 10)
    Object.assign(booking, { status: 'Cancelled', amountPaid: 400, refundDue: 400, refundStatus: 'Failed', refundSentAt: null })
    db.payments.filter((p) => p.bookingId === 10).forEach((p) => { p.referenceNumber = `py-dep-${p.id}` })
    db.payments.push({ id: 900, bookingId: 10, clientId: booking.clientId, method: 'GCash', option: 'Balance', amount: 250,
      referenceNumber: 'py-bal-10', status: 'Succeeded', paidAt: new Date().toISOString(), refundedAmount: 250 })
    saveDb()
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin')
    await screen.findByRole('heading', { name: 'Dashboard' })
    const attention = (await screen.findByRole('heading', { name: 'Needs your attention' })).closest('section')
    const row = await waitFor(() => within(attention).getAllByRole('listitem')
      .find((li) => within(li).queryByRole('button', { name: /booking #10\./ })))
    await user.click(within(row).getByRole('button', { name: /Send|Record/ }))

    const sum = within(screen.getByRole('dialog')).getByRole('list', { name: 'Refund' })
    expect(sum).toHaveTextContent('Already sent back online−₱250.00')
    expect(sum).toHaveTextContent('Still to refund₱150.00')
  })
})
