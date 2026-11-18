import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, pickDate, pickShade, readTermsAndAgree, renderApp, signIn } from './helpers'
import { dateFromToday } from '../lib/dates'
import { getDb, saveDb } from './mockBackend/db'
import { goToExternal } from '../lib/navigation'

vi.mock('../lib/navigation', () => ({ goToExternal: vi.fn() }))

/** Turns one of Kyla's upcoming bookings into a hold waiting for payment on Xendit (what Pay leaves with Xendit on). */
function holdForKyla() {
  const db = getDb()
  const booking = db.bookings.find((b) => b.id === 10) // Kyla's, five days ahead
  db.payments = db.payments.filter((p) => p.bookingId !== booking.id)
  Object.assign(booking, {
    status: 'AwaitingPayment', amountPaid: 0, paymentIdempotencyKey: 'key-test', paymentMethod: 'GCash',
    checkoutUrl: `https://checkout.test/ps-${booking.id}`, paymentHoldUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
  })
  saveDb()
  return booking
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(goToExternal).mockClear()
})

describe('Paying on Xendit', () => {
  it('redirects to the checkout address after pressing Pay', async () => {
    getDb().flags.xendit = true
    saveDb()
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await pickShade(user, '06')
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    pickDate(dateFromToday(4))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    await readTermsAndAgree(user)
    await user.click(screen.getByRole('button', { name: /^Pay / }))

    expect(await screen.findByText(/Opening GCash/)).toBeInTheDocument()
    const held = getDb().bookings.at(-1)
    expect(held.status).toBe('AwaitingPayment')
    expect(goToExternal).toHaveBeenCalledWith(held.checkoutUrl)
    expect(screen.queryByRole('heading', { name: 'Booking received!' })).not.toBeInTheDocument()
  })

  it('return page shows the receipt once the payment is confirmed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const held = holdForKyla()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${held.id}`)

    expect(await screen.findByText(/Confirming your payment/)).toBeInTheDocument()
    getDb().flags.paidHolds = [held.id] // Xendit has the money now
    saveDb()
    await act(() => vi.advanceTimersByTimeAsync(3_000))

    expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
    expect(screen.getByText(getDb().payments.at(-1).referenceNumber)).toBeInTheDocument()
  })

  it('return page says it is still confirming after a minute, and offers to try again or cancel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const held = holdForKyla()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${held.id}`)

    expect(await screen.findByText(/Confirming your payment/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(61_000))

    expect(await screen.findByText("Still confirming. We'll email you once it's through.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to My bookings' })).toBeInTheDocument()
    vi.useRealTimers()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(goToExternal).toHaveBeenCalledWith(getDb().bookings.find((b) => b.id === held.id).checkoutUrl)
  })

  it('return page says the payment was not completed when the hold is over', async () => {
    const held = holdForKyla()
    Object.assign(held, { status: 'Cancelled' })
    getDb().cancellations.push({ id: 999, bookingId: held.id, cancelledByUserId: 2, reason: 'PaymentNotCompleted', explanation: null, cancelledAt: new Date().toISOString() })
    saveDb()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${held.id}`)

    expect(await screen.findByText("The payment wasn't completed. You have not been charged.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book again' })).toHaveAttribute('href', '/book')
  })

  it('My bookings shows a hold apart from the appointments, with Continue payment', async () => {
    const held = holdForKyla()
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/bookings')

    const card = (await screen.findByText('Awaiting payment', { selector: '.badge' })).closest('li')
    expect(within(card).getByText(/Held for you until/)).toBeInTheDocument()
    expect(card.closest('ul')).toHaveClass('hold-cards') // apart from the Upcoming list: not an appointment until paid
    await user.click(within(card).getByRole('button', { name: 'Continue payment' }))
    expect(goToExternal).toHaveBeenCalledWith(getDb().bookings.find((b) => b.id === held.id).checkoutUrl)
  })

  it('Leyah finds holds only under Awaiting payment', async () => {
    const held = holdForKyla()
    const { ADMIN } = await import('./helpers')
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await user.click(await screen.findByRole('tab', { name: /Awaiting payment/ }))
    expect(await screen.findByText('1 booking')).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === held.id).status).toBe('AwaitingPayment')
  })
})

describe('Paying on Xendit when something goes wrong', () => {
  it('lets the client press Pay again after Xendit could not start, with a fresh payment', async () => {
    getDb().flags.xendit = true
    getDb().flags.failNextCheckout = true
    saveDb()
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await pickShade(user, '06')
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    pickDate(dateFromToday(4))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    await readTermsAndAgree(user)
    await user.click(screen.getByRole('button', { name: /^Pay / }))

    expect(await screen.findByText(/The payment couldn't be started/)).toBeInTheDocument()
    expect(goToExternal).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^Pay / }))

    expect(await screen.findByText(/Opening GCash/)).toBeInTheDocument()
    expect(goToExternal).toHaveBeenCalledWith(getDb().bookings.at(-1).checkoutUrl)
    expect(screen.queryByRole('heading', { name: 'Booking received!' })).not.toBeInTheDocument()
  })

  it('tells a client who was charged after the booking ended that a refund is coming', async () => {
    const held = holdForKyla()
    Object.assign(held, { status: 'Cancelled', amountPaid: 150, refundDue: 150 })
    saveDb()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${held.id}`)

    expect(await screen.findByText(/We received ₱150.00, but couldn't keep this time for you/)).toBeInTheDocument()
    expect(screen.queryByText(/You have not been charged/)).not.toBeInTheDocument()
  })

  it('canceling a hold says nothing was charged, not that a deposit is kept', async () => {
    holdForKyla()
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/bookings')

    const card = (await screen.findByText('Awaiting payment', { selector: '.badge' })).closest('li')
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText(/Nothing has been charged/)).toBeInTheDocument()
    expect(screen.queryByText(/deposit is non-refundable/)).not.toBeInTheDocument()
  })
})

describe('Paying on Xendit: small touches', () => {
  it('Continue payment goes back to the same page while there is time, and only makes a new one near the end', async () => {
    const held = holdForKyla()
    const firstPage = held.checkoutUrl
    const user = userEvent.setup()
    await signIn(CLIENT)
    const first = renderApp('/bookings')
    const card = (await screen.findByText('Awaiting payment', { selector: '.badge' })).closest('li')
    await user.click(within(card).getByRole('button', { name: 'Continue payment' }))
    expect(goToExternal).toHaveBeenLastCalledWith(firstPage) // same page, hold not stretched
    first.unmount()

    held.paymentHoldUntil = new Date(Date.now() + 5 * 60_000).toISOString() // Xendit needs 10 minutes for a page
    saveDb()
    vi.mocked(goToExternal).mockClear()
    renderApp('/bookings')
    const again = (await screen.findByText('Awaiting payment', { selector: '.badge' })).closest('li')
    await user.click(within(again).getByRole('button', { name: 'Continue payment' }))
    const newPage = getDb().bookings.find((b) => b.id === held.id).checkoutUrl
    expect(newPage).not.toBe(firstPage)
    expect(goToExternal).toHaveBeenLastCalledWith(newPage)
  })

  it('return page keeps checking after a passing error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const held = holdForKyla()
    getDb().flags.failNextPaymentStatus = true
    saveDb()
    await signIn(CLIENT)
    renderApp(`/bookings/payment?booking=${held.id}`)

    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    getDb().flags.paidHolds = [held.id]
    saveDb()
    await act(() => vi.advanceTimersByTimeAsync(3_000))

    expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
  })
})

describe("Leyah's day view and held slots", () => {
  it('shows a slot held for an online payment as a faint line, with no client or actions', async () => {
    const held = holdForKyla()
    Object.assign(held, { bookingDate: dateFromToday(0), startTime: '20:00:00' })
    saveDb()
    const { ADMIN } = await import('./helpers')
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await user.click(await screen.findByRole('button', { name: 'Show booking details' }))
    const day = await screen.findByRole('region', { name: 'Bookings on the chosen day' })
    const line = await within(day).findByText(/Held — a client is paying online until/)
    expect(line.closest('li')).toHaveTextContent('8:00 PM')
    expect(within(line.closest('li')).queryByRole('button')).toBeNull()
    expect(within(day).queryByText('Kyla Santos')).toBeNull()
  })
})
