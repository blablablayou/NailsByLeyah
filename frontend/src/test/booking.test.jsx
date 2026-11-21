import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentPanel } from '../components/PaymentPanel'
import { CancelBookingDialog } from '../components/BookingDialogs'
import { CLIENT, openPaymentTerms, readTermsAndAgree, renderApp, signIn, pickDate, pickShade } from './helpers'
import { dateFromToday } from '../lib/dates'
import { getDb, saveDb } from './mockBackend/db'
import { SalonProvider } from '../components/SalonProfile'
import { lookups } from './mockBackend/data/lookups'

// Soft Gel Extension with Design (₱499) + Chrome × 2 (₱20): a ₱150 deposit or ₱519 in full.
const QUOTE = { total: 519, deposit: 150, fullAmount: 519, balanceDue: 369, lines: [] }
const panel = (props) => <PaymentPanel quote={QUOTE} option="Deposit" onOptionChange={() => {}} {...props} />

describe('Payment step', () => {
  it('shows who to pay and the GCash / Maya number (the salon phone) under the account name', async () => {
    Object.assign(getDb().salonSettings, { phone: '09486475103', paymentAccountName: 'Leah Cabayao' })
    saveDb()
    render(<SalonProvider>{panel()}</SalonProvider>)
    expect(await screen.findByText('Leah Cabayao')).toBeInTheDocument()
    const number = screen.getByText('0948 647 5103')
    expect(number.closest('.pay-to-number')).toHaveTextContent('GCash / Maya number: 0948 647 5103')
  })

  it('shows no number line while the salon phone is empty', async () => {
    Object.assign(getDb().salonSettings, { phone: null, paymentAccountName: 'Leah Cabayao' })
    saveDb()
    render(<SalonProvider>{panel()}</SalonProvider>)
    expect(await screen.findByText('Leah Cabayao')).toBeInTheDocument()
    expect(screen.queryByText(/GCash \/ Maya number/)).toBeNull()
  })

  it('offers only the full payment when the service costs no more than the deposit', () => {
    render(panel({ option: null, quote: { total: 100, deposit: 100, fullAmount: 100, balanceDue: 0, lines: [] } }))
    expect(screen.queryByRole('radio', { name: 'Booking deposit' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Full payment' }).closest('label')).toHaveTextContent('₱100.00')
  })

  it('starts with nothing picked: the client chooses how much and how to pay', async () => {
    const user = userEvent.setup()
    render(panel({ option: null }))

    for (const name of ['Booking deposit', 'Full payment', 'GCash', 'Maya']) expect(screen.getByRole('radio', { name })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled()
    expect(screen.getByText('Choose how much to pay now (step 1) to continue.')).toBeInTheDocument()
    await readTermsAndAgree(user) // agreeing alone is not enough
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled()
  })

  it('keeps Pay disabled until the booking policy is accepted (7.6)', async () => {
    const user = userEvent.setup()
    const onPay = vi.fn()
    render(panel({ onPay }))

    expect(screen.queryByText('Please note')).toBeNull() // the separate deposit warning is gone; the first point covers it
    expect(screen.getByText('Choose GCash or Maya (step 2) to continue.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'GCash' }))
    expect(screen.getByText('Read the Booking & Payment Policy (step 3) to continue.')).toBeInTheDocument()
    // Three points to review, then the agreement.
    const review = screen.getByText('Before proceeding, please review:').closest('.pay-review')
    expect([...review.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'A ₱150.00 deposit is required to secure the appointment request.',
      'Your appointment is subject to payment verification and salon confirmation.',
      'Cancellation, refund, and rescheduling rules apply.',
    ])
    const ack = screen.getByRole('checkbox', { name: /^I have read and agree to the Booking Terms, Payment Policy, and Cancellation & Refund Policy/ })
    expect(ack).not.toBeChecked() // never ticked for the client
    expect(ack).toBeDisabled() // locked until the policy has been read
    expect(screen.getByText('Read the policy to the end to unlock the agreement.')).toBeInTheDocument()
    const pay = screen.getByRole('button', { name: /^Pay/ })
    expect(pay).toBeDisabled()
    await user.click(pay)
    expect(onPay).not.toHaveBeenCalled()

    await readTermsAndAgree(user)
    expect(ack).toBeChecked()
    expect(screen.getByText('Policy reviewed and agreed.')).toBeInTheDocument()
    expect(pay).toBeEnabled()
    await user.click(ack) // unticking locks Pay again
    expect(pay).toBeDisabled()
  })

  it('reading the policy unlocks the agreement box, without ticking it for the client', async () => {
    const user = userEvent.setup()
    render(panel({ onPay: vi.fn() }))

    await openPaymentTerms(user)
    const dialog = screen.getByRole('dialog', { name: 'Booking & Payment Policy' })
    // The booking sections of the Terms & Conditions (3–9), with the same version the booking records.
    expect(dialog).toHaveTextContent('Version 2.7')
    expect(within(dialog).getByRole('heading', { name: '5. Payment and the booking deposit' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('heading', { name: '2. Your account' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Agree and continue' })).toBeNull() // only to read
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))

    const ack = screen.getByRole('checkbox', { name: /^I have read and agree to the Booking Terms/ })
    expect(ack).toBeEnabled()
    expect(ack).not.toBeChecked()
    expect(screen.getByText('Policy reviewed. Please check the agreement box to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pay/ })).toBeDisabled()
  })

  it('sends only one payment when Pay is clicked several times quickly (7.7)', async () => {
    let finish
    const onPay = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    render(panel({ onPay }))
    await readTermsAndAgree(userEvent.setup())
    const pay = screen.getByRole('button', { name: /^Pay/ })

    fireEvent.click(pay)
    fireEvent.click(pay)
    fireEvent.click(pay)

    expect(onPay).toHaveBeenCalledTimes(1)
    expect(pay).toBeDisabled()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    await act(async () => finish())
  })

  it('shows what is paid now and what is left for each option, and the Pay button follows the choice', async () => {
    const user = userEvent.setup()
    const onOptionChange = vi.fn()
    const { rerender } = render(panel({ onPay: vi.fn(), onOptionChange }))

    expect(screen.getByRole('radio', { name: 'Booking deposit' }).closest('label')).toHaveTextContent('₱150.00')
    expect(screen.getByRole('radio', { name: 'Booking deposit' }).closest('label')).toHaveTextContent('Pay the rest (₱369.00) at the salon')
    expect(screen.getByRole('radio', { name: 'Full payment' }).closest('label')).toHaveTextContent('₱519.00')
    expect(screen.getByRole('button', { name: /Pay ₱150.00 deposit/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Full payment' }))
    expect(onOptionChange).toHaveBeenCalledWith('Full')
    rerender(panel({ onPay: vi.fn(), onOptionChange, option: 'Full' }))
    expect(screen.getByRole('button', { name: /Pay ₱519.00 in full/ })).toBeInTheDocument()
  })
})

describe('Administrator cancellation (7.8)', () => {
  it('can be submitted with a reason and no explanation', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue()
    const booking = { serviceName: 'Plain', bookingDate: '2026-12-01', startTime: '10:00:00' }
    render(<CancelBookingDialog booking={booking} reasons={lookups.adminCancellationReasons} allowExplanation onSubmit={onSubmit} onClose={() => {}} />)

    expect(screen.getByLabelText(/Explanation \(optional\)/)).not.toBeRequired()
    await user.selectOptions(screen.getByLabelText(/Reason for canceling/), 'ScheduleConflict')
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'ScheduleConflict', explanation: null })
  })

  it('requires a reason', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const booking = { serviceName: 'Plain', bookingDate: '2026-12-01', startTime: '10:00:00' }
    render(<CancelBookingDialog booking={booking} reasons={lookups.adminCancellationReasons} allowExplanation onSubmit={onSubmit} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Select a cancellation reason.')).toBeInTheDocument()
  })

  it('offers exactly the client reasons from the requirements', () => {
    expect(lookups.clientCancellationReasons.map((r) => r.label))
      .toEqual(['Change of schedule', 'Emergency', 'Booked by mistake', 'Found another provider', 'Others'])
    expect(lookups.adminCancellationReasons.map((r) => r.label))
      .toEqual(['Leyah is not available', 'Schedule conflict', 'Emergency', 'Client did not respond', 'Others'])
  })
})

describe('Booking flow', () => {
  it('books with add-ons, updates the total live, pays and shows the receipt', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    // Step 1: service, color and add-ons; the total updates as they change (Ref 10.4).
    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    const total = () => within(screen.getByRole('complementary')).getByText('Total').nextSibling.textContent
    expect(total()).toBe('₱499.00')
    // A new add-on goes on both hands, all 10 nails; one hand is 5, and the counter lowers it for an accent.
    await user.click(screen.getByRole('checkbox', { name: /French Tip/ }))
    expect(screen.getByRole('radio', { name: 'Both hands' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('10 nails')).toBeInTheDocument()
    expect(total()).toBe('₱649.00')
    await user.click(screen.getByRole('radio', { name: 'Right hand' }))
    expect(screen.getByText('5 nails')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fewer nails for French Tip' }))
    await user.click(screen.getByRole('button', { name: 'Fewer nails for French Tip' }))
    expect(screen.getByText('3 nails')).toBeInTheDocument()
    expect(total()).toBe('₱544.00')
    // A color is required for a new set.
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    expect(screen.getByText('Choose a nail color to continue.')).toBeInTheDocument()
    await pickShade(user, '06')
    expect(within(screen.getByRole('complementary')).getByText('#06 – Light Pink-Lavender')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next:/ }))

    // Step 2: booked times, the 30-minute break after them and times where the 3-hour service doesn't fit
    // before the next appointment are disabled (Ref 10.1). Seeded booking #10: 1:00 PM, 60 minutes.
    pickDate(dateFromToday(5))
    expect(await screen.findByRole('button', { name: /^1:00.*Booked/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^2:00.*Break until 2:30 PM/ })).toBeDisabled() // the break, not a booking
    expect(screen.getByRole('button', { name: /^11:00.*Too close to the 1:00 PM appointment/ })).toBeDisabled() // would end 2:00 PM
    expect(screen.getByText('1:00 PM – 2:00 PM')).toBeInTheDocument() // "Taken:" shows the real appointment
    expect(screen.getByRole('button', { name: /^2:30 PM – 5:30 PM.*Available/ })).toBeEnabled()
    pickDate(dateFromToday(3))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))

    // The note for Leyah sits under the date and time (Ref 2.4).
    // The note is typed; a quick-add suggestion adds a common phrase to it.
    await user.type(screen.getByLabelText(/Note for Leyah/), 'Short almond nails please')
    await user.click(screen.getByRole('button', { name: /I'll bring a reference photo/ }))
    expect(screen.getByLabelText(/Note for Leyah/)).toHaveValue("Short almond nails please. I'll bring a reference photo")
    await user.click(screen.getByRole('button', { name: /^Next:/ }))

    // Step 3: summary and payment.
    expect(screen.getByRole('heading', { name: 'Booking summary' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Booking policy' })).getByText(/reschedule online up to 24 hours before/)).toBeInTheDocument()
    expect(screen.getByText(/French Tip — Right hand/)).toBeInTheDocument()
    expect(screen.getByText('#06 – Light Pink-Lavender', { selector: '.review-color' , exact: false })).toBeInTheDocument()
    expect(screen.getByText("Short almond nails please. I'll bring a reference photo")).toBeInTheDocument()
    // Paying in full: the summary and the Pay button switch to the whole amount (₱499 + French Tip × 3 = ₱544).
    await user.click(screen.getByRole('radio', { name: 'Full payment' }))
    expect(screen.getByText('Full payment now').nextSibling).toHaveTextContent('₱544.00')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await readTermsAndAgree(user)
    await user.click(screen.getByRole('button', { name: /Pay ₱544.00 in full/ }))

    // Paid, but waiting for Leyah to confirm.
    expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Leyah will check it and confirm/)).toBeInTheDocument()
    const payment = getDb().payments.at(-1)
    expect(screen.getByText(payment.referenceNumber)).toBeInTheDocument()
    expect(payment).toMatchObject({ method: 'Maya', option: 'Full', amount: 544, balanceAfter: 0 })
    expect(getDb().bookings.at(-1)).toMatchObject({ bookingDate: dateFromToday(3), startTime: '11:00:00', durationMinutes: 180, status: 'Pending', amountPaid: 544, nailColor: '#06' })
    expect(getDb().bookings.at(-1).note).toBe("Short almond nails please. I'll bring a reference photo")
    expect(getDb().bookingAddOns.at(-1)).toMatchObject({ addOnId: 1, nailCount: 3, hand: 'Right' })
  })

  it('disables Reschedule for appointments less than 24 hours away (Ref 10.6)', async () => {
    // Move Kyla's seeded booking #8 to two hours from now.
    const soon = new Date(Date.now() + 2 * 3_600_000)
    const booking = getDb().bookings.find((b) => b.id === 8)
    booking.bookingDate = dateFromToday(soon.getDate() === new Date().getDate() ? 0 : 1)
    booking.startTime = `${String(soon.getHours()).padStart(2, '0')}:00:00`

    await signIn(CLIENT)
    renderApp('/bookings')

    expect(await screen.findByText('Rescheduling is only possible at least 24 hours before your appointment.')).toBeInTheDocument()
  })
})
