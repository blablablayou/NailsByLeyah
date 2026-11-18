import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Receipt } from '../components/Receipt'
import { ReceiptDownload } from '../components/ReceiptDownload'

// The payment receipt polish of 2026-11-16: the reference with a Copy button, add-ons as a price list, a totals block,
// the booking's progress, one "what happens next" line, and a clearly unavailable PDF button with its reason.

const RECEIPT = {
  referenceNumber: 'GC-20261115-37728EAB6C', bookingId: 1, paymentOptionLabel: 'Full payment', method: 'GCash',
  serviceName: 'Soft Gel Extension + Removal (My Work)', bookingDate: '2026-11-30', startTime: '18:00:00',
  totalAmount: 874, amount: 874, balanceDue: 0, bookingStatus: 'Pending', paidAt: '2026-11-15T04:59:00Z', verified: false,
}
const BOOKING = {
  status: 'Pending', totalPrice: 874, balanceDue: 0,
  addOns: [
    { addOnId: 1, name: 'French Tip', handLabel: 'Left hand', nailCount: 5, linePrice: 75 },
    { addOnId: 2, name: 'Chrome', handLabel: 'Right hand', nailCount: 5, linePrice: 50 },
  ],
}
const show = (receipt = {}, booking = {}) => render(<Receipt receipt={{ ...RECEIPT, ...receipt }} booking={{ ...BOOKING, ...booking }} />)

describe('Receipt with the balance paid online', () => {
  it('lists the deposit and the balance, each with its reference, and the total paid', () => {
    show({ amount: 150, amountPaid: 499, paymentOptionLabel: 'Booking deposit', payments: [
      { option: 'Deposit', optionLabel: 'Booking deposit', method: 'GCash', referenceNumber: 'py-dep-1', amount: 150, paidAt: '2026-11-15T04:59:00Z' },
      { option: 'Balance', optionLabel: 'Balance', method: 'Maya', referenceNumber: 'py-bal-1', amount: 349, paidAt: '2026-11-16T04:59:00Z' },
    ] }, { totalPrice: 499, balanceDue: 0 })

    const payments = screen.getByRole('list', { name: 'Payments' })
    expect(payments).toHaveTextContent('Booking deposit via GCash py-dep-1₱150.00')
    expect(payments).toHaveTextContent('Balance via Maya py-bal-1₱349.00')
    expect(screen.getByRole('group', { name: 'Totals' })).toHaveTextContent('Amount paid₱499.00')
  })
})

describe('Payment receipt polish', () => {
  it('copies the reference number', async () => {
    const user = userEvent.setup()
    show()
    expect(screen.getByText('GC-20261115-37728EAB6C')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy reference number' }))
    expect(await navigator.clipboard.readText()).toBe('GC-20261115-37728EAB6C')
    expect(screen.getByText('Copied')).toBeInTheDocument()
  })

  it('lists each add-on with its price on the same row', () => {
    show()
    const list = screen.getByRole('list', { name: 'Add-ons' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('French Tip — Left hand × 5')
    expect(within(rows[0]).getByText('₱75.00').closest('.receipt-price')).not.toBeNull() // the price sits at the row's end
  })

  it('shows the totals together, with what is left to pay', () => {
    show({ paymentOptionLabel: 'Booking deposit', amount: 150, balanceDue: 724 }, { balanceDue: 724 })
    const totals = screen.getByRole('group', { name: 'Totals' })
    expect(within(totals).getByText('Total').nextSibling).toHaveTextContent('₱874.00')
    expect(within(totals).getByText('Amount paid').nextSibling).toHaveTextContent('₱150.00')
    expect(within(totals).getByText('Balance due at the salon').nextSibling).toHaveTextContent('₱724.00')
  })

  it('shows where the booking is: paid, Leyah checks, confirmed', () => {
    const { unmount } = show()
    let steps = screen.getByRole('list', { name: 'Booking progress' })
    expect(within(steps).getAllByRole('listitem').map((s) => s.textContent)).toEqual(['Paid', 'Leyah checks', 'Confirmed'])
    expect(within(steps).getByText('Leyah checks').closest('li')).toHaveAttribute('aria-current', 'step')
    unmount()

    show({ bookingStatus: 'Confirmed', verified: true }, { status: 'Confirmed' })
    steps = screen.getByRole('list', { name: 'Booking progress' })
    expect(within(steps).getByText('Confirmed').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(within(steps).getAllByRole('listitem').every((s) => s.classList.contains('done'))).toBe(true)
  })

  it('has no progress line for a canceled booking', () => {
    show({ bookingStatus: 'Cancelled' }, { status: 'Cancelled' })
    expect(screen.queryByRole('list', { name: 'Booking progress' })).toBeNull()
    expect(screen.getByText(/None \(the deposit is kept\)/)).toBeInTheDocument()
  })

  it('says what happens next in one line, and keeps the deposit rule', () => {
    show()
    expect(screen.getByText(/Leyah will check it and confirm/)).toBeInTheDocument()
    expect(screen.getByText('The booking deposit is non-refundable unless the salon cancels.')).toBeInTheDocument()
  })

  // Review fixes, 2026-11-16: every refund state and fallback keeps its facts.
  it('shows a refund still to send, and one already sent with its reference', () => {
    const { unmount } = show({ bookingStatus: 'Cancelled', refundDue: 874 }, { status: 'Cancelled' })
    expect(screen.getByText('to be sent to the account you paid from')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Totals' })).getByText('Refund')).toBeInTheDocument()
    unmount()

    show({ bookingStatus: 'Cancelled', refundDue: 874, refundSentAt: '2026-11-16T02:00:00Z', refundReference: 'RF-123' }, { status: 'Cancelled' })
    expect(screen.getByText(/^sent /)).toBeInTheDocument()
    expect(screen.getByText('RF-123')).toBeInTheDocument()
  })

  it('has no progress line for a no-show, and shows the refund line instead of a balance', () => {
    show({ bookingStatus: 'NoShow' }, { status: 'NoShow' })
    expect(screen.queryByRole('list', { name: 'Booking progress' })).toBeNull()
    expect(screen.queryByText('Balance due at the salon')).toBeNull()
    expect(screen.getByText(/None \(the deposit is kept\)/)).toBeInTheDocument()
  })

  it('waits on Confirmed once Leyah has verified a pending payment', () => {
    show({ verified: true })
    const steps = screen.getByRole('list', { name: 'Booking progress' })
    expect(within(steps).getByText('Leyah checks').closest('li')).toHaveClass('done')
    expect(within(steps).getByText('Confirmed').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('works without add-ons, and from the receipt alone', () => {
    const { unmount } = show({}, { addOns: undefined })
    expect(screen.queryByRole('list', { name: 'Add-ons' })).toBeNull()
    unmount()

    render(<Receipt receipt={{ ...RECEIPT, balanceDue: 0 }} />)
    expect(screen.getByText('Soft Gel Extension + Removal (My Work)')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Totals' })).getByText('Total').nextSibling).toHaveTextContent('₱874.00')
    expect(screen.getByRole('list', { name: 'Booking progress' })).toBeInTheDocument()
  })

  it('says so when the number cannot be copied, and selects it to copy by hand', async () => {
    const user = userEvent.setup()
    show()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true })
    await user.click(screen.getByRole('button', { name: 'Copy reference number' }))
    expect(await screen.findByText('Select & copy')).toBeInTheDocument()
    expect(window.getSelection().toString()).toBe('GC-20261115-37728EAB6C')
  })

  it('makes the PDF button clearly unavailable, with the reason, until the payment is verified', () => {
    const { unmount } = render(<ReceiptDownload receipt={RECEIPT} />)
    const button = screen.getByRole('button', { name: 'Download receipt (PDF)' })
    expect(button).toBeDisabled()
    expect(button).toHaveClass('receipt-pdf-locked')
    expect(screen.getByText('Available once Leyah verifies your payment.')).toBeInTheDocument()
    unmount()

    render(<ReceiptDownload receipt={{ ...RECEIPT, verified: true }} />)
    expect(screen.getByRole('button', { name: 'Download receipt (PDF)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download receipt (PDF)' })).not.toHaveClass('receipt-pdf-locked')
  })
})
