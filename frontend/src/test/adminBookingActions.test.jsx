import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'
import { addDays, dateFromToday, toIsoDate, today } from '../lib/dates'
import { formatDate } from '../lib/format'
import { api } from '../api'
import ExcelJS from 'exceljs'
import { buildSalesReportWorkbook, netReceived, totalReceived } from '../lib/reportExcel'
import { BookingDetails } from '../pages/admin/BookingDetails'
import { StatusBadge } from '../components/ui'
import { CancelBookingDialog } from '../components/BookingDialogs'

const row = (name) => screen.getAllByRole('row').find((r) => within(r).queryByText(name))

/** Puts one seeded booking at a date and status, with a client name that appears nowhere else. */
function stage(overrides) {
  const db = getDb()
  const booking = db.bookings.find((b) => b.id === 8)
  const client = db.users.find((u) => u.id === booking.clientId)
  client.firstName = 'Testa'
  client.lastName = 'Client'
  db.bookings.filter((b) => b.id !== booking.id && b.bookingDate === (overrides.bookingDate ?? booking.bookingDate)).forEach((b) => { b.isDeleted = true })
  Object.assign(booking, overrides)
  saveDb()
  return booking
}

const openDashboard = async () => {
  await signIn(ADMIN)
  renderApp('/admin')
  await screen.findByRole('heading', { name: 'Dashboard' })
}

const menuFor = async (user, name) => {
  await user.click(within(await waitFor(() => row(name))).getByRole('button', { name: /More actions/ }))
}

/** The dashboard's "Needs your attention" row for a booking. */
const attentionRow = (bookingId) => waitFor(() => {
  const card = screen.getByRole('heading', { name: 'Needs your attention' }).closest('section')
  const item = within(card).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name: new RegExp(`booking #${bookingId}\\.`) }))
  expect(item).toBeTruthy()
  return item
})

describe('Completing a booking and its balance', () => {
  it('records the balance and reference when Leyah says it was paid', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    await openDashboard()

    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Did they come?')
    expect(item).toHaveTextContent('date passed, still confirmed')
    await user.click(within(item).getByRole('button', { name: 'Complete' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete booking' })
    expect(within(dialog).getByRole('radio', { name: 'Balance received' })).toBeChecked()
    await user.type(within(dialog).getByLabelText(/GCash reference/), 'GC-555')
    await user.click(within(dialog).getByRole('button', { name: 'Complete booking' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as completed, balance received.`)).toBeInTheDocument()
    const saved = getDb().bookings.find((b) => b.id === booking.id)
    expect(saved.status).toBe('Completed')
    expect(saved.balanceReference).toBe('GC-555')
    expect(saved.balanceReceived).toBeGreaterThan(0)
  })

  it('can complete without the balance, then record it later from Needs your attention', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    // Only this booking owes money, so its row is among the first five shown.
    getDb().bookings.forEach((b) => { if (b.status === 'Completed') b.isDeleted = true })
    saveDb()
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'Complete' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete booking' })
    await user.click(within(dialog).getByRole('radio', { name: 'Not paid yet' }))
    expect(within(dialog).queryByLabelText(/GCash reference/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Complete booking' }))
    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived ?? 0).toBe(0)

    const owing = await attentionRow(booking.id)
    expect(owing).toHaveTextContent('Balance not recorded · Testa Client')
    await user.click(within(owing).getByRole('button', { name: 'Record' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Record balance' })).getByRole('button', { name: 'Record balance' }))

    expect(await screen.findByText(`Balance recorded for booking #${booking.id}.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived).toBeGreaterThan(0)
  })

  it('completes straight away when nothing is left to pay', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed', amountPaid: 5000, paymentOption: 'Full' })
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('No-shows', () => {
  it('asks first, then marks a booking whose time has arrived', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'No-show' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark as no-show' })
    expect(dialog).toHaveTextContent("deposit is kept as the no-show fee. This can't be undone.")
    await user.click(within(dialog).getByRole('button', { name: 'Mark as no-show' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as a no-show.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).status).toBe('NoShow')
  })

  it('is not offered before the appointment time', async () => {
    const user = userEvent.setup()
    stage({ bookingDate: dateFromToday(2), startTime: '11:00:00', status: 'Confirmed' })
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await screen.findByRole('heading', { name: 'Find bookings' })
    await menuFor(user, 'Testa Client')

    expect(screen.queryByRole('menuitem', { name: 'Mark as no-show' })).toBeNull()
  })

  it('reads as "No-show"', () => {
    render(<StatusBadge status="NoShow" />)
    expect(screen.getByText('No-show')).toHaveClass('badge-noshow')
  })
})

describe('Refunds', () => {
  const paidInFull = { id: 5, serviceName: 'Plain', bookingDate: '2026-11-20', startTime: '11:00:00', depositAmount: 150,
    payment: { amountPaid: 300 }, client: { firstName: 'Kyla', lastName: 'Santos' } }
  const reasons = [{ value: 'StaffUnavailable', label: 'Leyah is not available' }, { value: 'ClientDidNotRespond', label: 'Client did not respond' }]

  it('tells a client who paid in full what comes back when cancelling', () => {
    render(<CancelBookingDialog booking={paidInFull} reasons={[]} onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('You paid ₱300.00. The ₱150.00 deposit is non-refundable, so ₱150.00 will be refunded')
  })

  it('tells a client who paid only the deposit that nothing comes back', () => {
    render(<CancelBookingDialog booking={{ ...paidInFull, payment: { amountPaid: 150 } }} reasons={[]} onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('non-refundable, so nothing is refunded')
  })

  it('tells Leyah the whole payment goes back when the salon cancels, but not when the client stopped answering', async () => {
    const user = userEvent.setup()
    render(<CancelBookingDialog booking={paidInFull} reasons={reasons} allowExplanation onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('everything they paid: ₱300.00, the deposit included')
    await user.selectOptions(screen.getByLabelText(/Reason for cancelling/), 'ClientDidNotRespond')
    expect(screen.getByRole('dialog')).toHaveTextContent('the ₱150.00 deposit is kept, and ₱150.00 is refunded')
  })

  it('lists a refund to send on the dashboard until Leyah records it', async () => {
    const user = userEvent.setup()
    // Leyah cancelled this paid-in-full booking because she was sick, so all ₱300 goes back.
    const booking = stage({ bookingDate: addDays(today(), 4), startTime: '11:00:00', status: 'Cancelled', amountPaid: 300, paymentOption: 'Full', refundDue: 300 })
    await openDashboard()
    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Refund to send · Testa Client')
    await user.click(within(item).getByRole('button', { name: 'Record' }))
    const dialog = screen.getByRole('dialog', { name: 'Record refund' })
    await user.type(within(dialog).getByLabelText(/reference/), 'GC-RF-9')
    await user.click(within(dialog).getByRole('button', { name: 'Record refund sent' }))

    expect(await screen.findByText(`Refund recorded for booking #${booking.id}.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id)).toMatchObject({ refundReference: 'GC-RF-9' })
  })
})

describe('Booking details', () => {
  const base = { id: 3, bookingDate: '2026-11-06', startTime: '11:00:00', endTime: '12:00:00', createdAt: '2026-11-04T15:45:00Z',
    client: { firstName: 'Kyla', lastName: 'Santos', username: 'kyla', email: 'k@example.test', phoneNumber: '09170000000' },
    serviceName: 'Plain', servicePrice: 300, totalPrice: 300, depositAmount: 150, addOns: [], referenceImages: [], note: null, cancellation: null }

  it('shows a balance paid after the service, with its reference', () => {
    render(<BookingDetails onClose={() => {}} booking={{ ...base, status: 'Completed', balanceDue: 0, payment: { amountPaid: 150, optionLabel: 'Booking deposit',
      balanceReceived: 150, balanceReceivedAt: '2026-11-06T05:00:00Z', balanceReference: 'GC-9' } }} />)

    expect(screen.getByText('GC-9')).toBeInTheDocument()
    expect(screen.getByText('Balance received')).toBeInTheDocument()
    expect(screen.getByText('Paid in full')).toBeInTheDocument()
  })

  it('does not ask for the balance of a no-show', () => {
    render(<BookingDetails onClose={() => {}} booking={{ ...base, status: 'NoShow', balanceDue: 150, payment: { amountPaid: 150, optionLabel: 'Booking deposit', balanceReceived: 0 } }} />)

    expect(screen.getByText('Not collected')).toBeInTheDocument()
    expect(screen.getByText('Not collected').closest('.bd-tile')).not.toHaveClass('bd-tile-due')
  })
})

describe('Dashboard', () => {
  it('lists upcoming bookings and asks Leyah to check a payment, then confirms it', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), 1), startTime: '11:00:00', status: 'Pending' })
    await openDashboard()

    const week = screen.getByRole('heading', { name: 'Next 7 days' }).closest('section')
    const line = within(week).getByRole('button', { name: /Testa Client, Pending/ })
    expect(line).toHaveTextContent('Testa Client · ')

    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Check payment · Testa Client')
    await user.click(within(item).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(`Booking #${booking.id} confirmed.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).status).toBe('Confirmed')
  })

  it('shows the next client with the colour, Stones and note, and another day from the date stepper', async () => {
    const user = userEvent.setup()
    const day = addDays(today(), 3)
    stage({ bookingDate: day, startTime: '11:00:00', status: 'Confirmed', nailColor: '#06', note: 'Short almond' })
    await openDashboard()

    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Next day' }))
    const card = (await screen.findByRole('heading', { name: /First client/ })).closest('section')

    expect(card).toHaveTextContent('11:00 AM')
    expect(card).toHaveTextContent('Testa Client')
    expect(card).toHaveTextContent('#06')
    expect(card).toHaveTextContent('Short almond')
    expect(within(card).getByText(/in \d+ days?/)).toBeInTheDocument()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(await screen.findByRole('heading', { name: 'Next client' })).toBeInTheDocument()
  })

  it('says all caught up when nothing needs Leyah', async () => {
    const db = getDb()
    db.bookings.forEach((b) => { if (b.status === 'Pending' || b.status === 'Completed' || b.bookingDate <= today()) b.isDeleted = true })
    saveDb()
    await openDashboard()

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
  })

  it("shows the day's schedule beside the next 7 days, and the balance still to collect", async () => {
    stage({ bookingDate: today(), startTime: '23:00:00', status: 'Confirmed' })
    getDb().bookings.forEach((b) => { if (b.status === 'Pending' || b.status === 'Completed' || (b.bookingDate < today())) b.isDeleted = true })
    saveDb()
    await openDashboard()

    const day = (await screen.findByRole('heading', { name: 'Today’s schedule' })).closest('section')
    expect(within(day).getByRole('button', { name: /11:00 PM to .*Testa Client, Confirmed/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next 7 days' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Today at a glance' })).toHaveTextContent(/to collect/) // the balance, now in the summary bar
    expect(screen.queryByRole('button', { name: 'Busy day' })).toBeNull()
    expect(screen.queryByText('Moved to other pages')).toBeNull()
  })

  it('puts what needs action first, then the day, with the next client beside them', async () => {
    stage({ bookingDate: today(), startTime: '23:00:00', status: 'Confirmed' })
    await openDashboard()
    await screen.findByRole('heading', { name: 'Needs your attention' })
    const main = document.querySelector('.dash-main')
    const side = document.querySelector('.dash-side')
    expect([...main.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Needs your attention', 'Today’s schedule'])
    // The side column: the next client, this month, the week, and the latest feedback once it has loaded.
    await waitFor(() => expect([...side.querySelectorAll('h2')].map((h) => h.textContent))
      .toEqual(['Next client', 'This month', 'Next 7 days', 'Latest feedback']))
    // Today's count sits beside its heading, not in a stat tile.
    const today_ = screen.getByRole('heading', { name: 'Today’s schedule' }).closest('section')
    expect(today_.querySelector('.dash-count')).toHaveTextContent(/^\d+ appointments?$/)
    expect(document.querySelector('.dash-tile, .dash-art, .dash-stats, .dash-head-icon')).toBeNull() // no icon tiles, drawing or stat tiles
  })
})

describe('Dashboard at a glance', () => {
  const summary = () => screen.getByRole('list', { name: 'Today at a glance' })

  it('sums up the day in one bar: appointments, payments to check, deposits today and balance to collect', async () => {
    stage({ bookingDate: today(), startTime: '23:00:00', status: 'Pending' })
    await openDashboard()
    await screen.findByRole('heading', { name: 'Needs your attention' })
    const items = within(summary()).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatch(/^\d+ appointments? today$/)
    expect(items[1]).toMatch(/^\d+ payments? to check$/)
    expect(items[2]).toMatch(/^₱[\d,.]+ deposits today$/)
    expect(items[3]).toMatch(/^₱[\d,.]+ to collect$/)
    // Each figure jumps to its section.
    expect(within(summary()).getByRole('link', { name: /payments? to check/ })).toHaveAttribute('href', '#dash-attention')
    expect(within(summary()).getByRole('link', { name: /appointments? today/ })).toHaveAttribute('href', '#dash-day')
  })

  it('links deposits to Reports, and the section jumps scroll without adding to Back', async () => {
    await openDashboard()
    await screen.findByRole('heading', { name: 'Needs your attention' })
    expect(within(summary()).getByRole('link', { name: /deposits today/ })).toHaveAttribute('href', '/admin/reports')
    const jump = within(summary()).getByRole('link', { name: /payments? to check/ })
    const scroll = vi.fn()
    document.getElementById('dash-attention').scrollIntoView = scroll
    expect(fireEvent.click(jump)).toBe(false) // the browser's own jump (and its Back step) is replaced
    expect(scroll).toHaveBeenCalled()
  })

  it('names the summary after the chosen day, and says the balance covers 8 days', async () => {
    const user = userEvent.setup()
    await openDashboard()
    await screen.findByRole('heading', { name: 'Needs your attention' })
    expect(within(summary()).getAllByRole('listitem')[3]).toHaveTextContent(/to collect$/)
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    const bar = await screen.findByRole('list', { name: /at a glance$/ })
    await waitFor(() => expect(bar).not.toHaveAccessibleName('Today at a glance'))
    expect(within(bar).getAllByRole('listitem')[3]).toHaveTextContent(/to collect over 8 days$/)
    expect(within(bar).getAllByRole('listitem')[2]).toHaveTextContent(/deposits today$/) // still today's money
  })

  it('opens New booking from the dashboard and links Block time to the schedule', async () => {
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByRole('link', { name: 'Block time' })).toHaveAttribute('href', '/admin/schedule')
    await user.click(screen.getByRole('button', { name: '+ New booking' }))
    expect(await screen.findByRole('dialog', { name: 'New booking' })).toBeInTheDocument()
  })

  it('gives every section heading a small icon, hidden from screen readers', async () => {
    await openDashboard()
    await screen.findByRole('heading', { name: 'Latest feedback' })
    for (const h of document.querySelectorAll('.dash-section h2')) {
      expect(h.closest('.dash-card-head').querySelector('svg.dash-head-svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('shows this month from the monthly report, with a link to Reports', async () => {
    await openDashboard()
    const month = (await screen.findByRole('heading', { name: 'This month' })).closest('section')
    await waitFor(() => expect(month).toHaveTextContent(/\d+ made/))
    expect(month).toHaveTextContent(/\d+ completed/)
    expect(month).toHaveTextContent(/₱[\d,.]+ net received/)
    expect(within(month).getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/admin/reports')
  })

  it('shows the latest feedback with its client, and hides the section when there is none', async () => {
    await openDashboard()
    const card = (await screen.findByRole('heading', { name: 'Latest feedback' })).closest('section')
    expect(card).toHaveTextContent('Very gentle removal and a lovely design.')
    expect(within(card).getByRole('link', { name: /Feedback/ })).toHaveAttribute('href', '/admin/feedback')
  })

  it('leaves out Latest feedback when no client has rated yet', async () => {
    getDb().feedback = []
    saveDb()
    await openDashboard()
    await screen.findByRole('heading', { name: 'This month' })
    await waitFor(() => expect(document.querySelector('.dash-month .dash-quiet, .dash-month-figures')).not.toBeNull())
    expect(screen.queryByRole('heading', { name: 'Latest feedback' })).toBeNull()
  })

  it("dates the latest feedback in the salon's own day, as the Feedback page does", async () => {
    // 7:30 am in Manila on Nov 16 is still Nov 15 in UTC.
    const createdAt = '2026-11-15T23:30:00.000Z'
    getDb().feedback.push({ id: 99, clientId: 2, rating: 5, comment: 'Early bird', submissionKey: 'early', createdAt })
    saveDb()
    await openDashboard()
    const card = (await screen.findByRole('heading', { name: 'Latest feedback' })).closest('section')
    expect(card).toHaveTextContent('Early bird')
    expect(card).toHaveTextContent(formatDate(toIsoDate(new Date(createdAt))).replace(/, \d{4}$/, ''))
  })

  it('a booking made from the dashboard shows its message and refreshes This month', async () => {
    const user = userEvent.setup()
    const reports = vi.spyOn(api.admin, 'monthlyReport')
    try {
      await openDashboard()
      await waitFor(() => expect(reports).toHaveBeenCalledTimes(1))
      await user.click(screen.getByRole('button', { name: '+ New booking' }))
      const dialog = await screen.findByRole('dialog', { name: 'New booking' })
      await user.click(within(dialog).getByRole('radio', { name: 'Facebook' }))
      await user.type(within(dialog).getByLabelText(/^Name/), 'Ana Santos')
      await user.click(within(dialog).getByRole('radio', { name: /^Plain\b/ }))
      for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
      await user.click(await within(dialog).findByRole('radio', { name: /^11:00 AM/ }))
      await user.click(within(dialog).getByRole('radio', { name: 'Deposit' }))
      await user.click(within(dialog).getByRole('button', { name: 'Book and confirm' }))

      expect(await screen.findByText(/made for Ana Santos and confirmed/)).toBeInTheDocument()
      await waitFor(() => expect(reports).toHaveBeenCalledTimes(2)) // This month asked again after the change
    } finally {
      reports.mockRestore()
    }
  })

  it('leaves out Latest feedback, and keeps the page up, when feedback cannot load', async () => {
    const failed = Promise.reject(Object.assign(new Error('down'), { status: 500 }))
    failed.catch(() => {})
    const spy = vi.spyOn(api.admin, 'feedback').mockReturnValue(failed)
    try {
      await openDashboard()
      await failed.catch(() => {}) // the request has finished
      await screen.findByRole('heading', { name: 'This month' })
      expect(screen.queryByRole('heading', { name: 'Latest feedback' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Needs your attention' })).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('keeps the dashboard up when the monthly report cannot load', async () => {
    const spy = vi.spyOn(api.admin, 'monthlyReport').mockRejectedValue(Object.assign(new Error('down'), { status: 500 }))
    try {
      await openDashboard()
      const month = (await screen.findByRole('heading', { name: 'This month' })).closest('section')
      expect(await within(month).findByText('This month’s figures couldn’t load. See Reports.')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Needs your attention' })).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('Sales report Excel file', () => {
  const report = { bookingsMade: 4, bookingsCompleted: 3, bookingsCancelled: 1, bookingsNoShow: 2, depositsCollected: 1200, balancesReceived: 450, balancesUnpaid: 150, completedServicesValue: 1800, refundsSent: 300 }
  // The value beside a label in the summary band: the label in column A, the figure in the last column (J).
  const valueOf = (sheet, label) => {
    let found
    sheet.eachRow((row) => {
      if (row.getCell(1).value === label && found === undefined) found = row.getCell(10).value
    })
    return found
  }
  const rowWith = (sheet, text) => {
    let found
    sheet.eachRow((row, n) => { if (row.getCell(1).value === text && found === undefined) found = n })
    return found
  }

  it('adds online payments and balances into the total received, and takes the refunds sent off for the net', () => {
    expect(totalReceived(report)).toBe(1650)
    expect(netReceived(report)).toBe(1350)
    expect(netReceived({ ...report, refundsSent: undefined })).toBe(1650) // a report from before refunds were counted
  })

  it('lays the month out like a printed report: header band, column headings, a row per busy day, grand total, summary', async () => {
    const days = [{ ...report, date: '2026-11-03' }, { date: '2026-11-04', bookingsMade: 0, bookingsCompleted: 0, bookingsCancelled: 0, bookingsNoShow: 0, depositsCollected: 0, balancesReceived: 0, refundsSent: 0 }]
    const book = buildSalesReportWorkbook(ExcelJS, { period: 'November 2026', report: { ...report, days }, generatedAt: new Date(2026, 10, 16, 15, 5) })
    expect(book.worksheets.map((w) => w.name)).toEqual(['Sales Report'])
    const sheet = book.getWorksheet('Sales Report')

    // Report header band
    expect(sheet.getCell('A1').value).toBe('NAILS BY LEYAH')
    expect(sheet.getCell('A2').value).toBe('Sales Report')
    expect(sheet.getCell('A3').value).toBe('Period: November 2026')
    expect(String(sheet.getCell('F1').value)).toMatch(/^Printed: Nov 16, 2026/)

    // Column headings, repeated on every printed page
    const head = rowWith(sheet, 'Date')
    expect(sheet.getRow(head).values.slice(1)).toEqual(['Date', 'Made', 'Completed', 'Cancelled', 'No-show', 'Paid online', 'Balances received', 'Total received', 'Refunds sent', 'Net received'])
    expect(sheet.pageSetup.printTitlesRow).toBe(`${head}:${head}`)

    // Details: Nov 4 had nothing, so it's left out; then the grand total adds the rows up
    expect(sheet.getCell(`A${head + 1}`).value).toBe('Tue, Nov 3')
    expect(sheet.getCell(`H${head + 1}`).value).toMatchObject({ formula: `F${head + 1}+G${head + 1}`, result: 1650 })
    expect(sheet.getCell(`A${head + 2}`).value).toBe('Grand Total')
    expect(sheet.getCell(`F${head + 2}`).value).toMatchObject({ formula: `SUM(F${head + 1}:F${head + 1})`, result: 1200 })
    expect(sheet.getCell(`F${head + 1}`).numFmt).toContain('#,##0.00')
    expect(sheet.getCell(`I${head + 1}`).value).toBe(300)
    expect(sheet.getCell(`J${head + 1}`).value).toMatchObject({ formula: `H${head + 1}-I${head + 1}`, result: 1350 })
    expect(sheet.getCell(`J${head + 2}`).value).toMatchObject({ formula: `SUM(J${head + 1}:J${head + 1})`, result: 1350 })

    // Summary band keeps every figure the old Summary sheet had, led by what Leyah kept
    expect(valueOf(sheet, 'Net received')).toBe(1350)
    expect(valueOf(sheet, 'Total received')).toBe(1650)
    expect(valueOf(sheet, 'Refunds sent')).toBe(300)
    expect(valueOf(sheet, 'Paid online')).toBe(1200)
    expect(valueOf(sheet, 'Balances received')).toBe(450)
    expect(valueOf(sheet, 'Completed services')).toBe(1800)
    expect(valueOf(sheet, 'Balances unpaid')).toBe(150)
    expect(valueOf(sheet, 'Bookings made')).toBe(4)
    expect(valueOf(sheet, 'Completed')).toBe(3)
    expect(valueOf(sheet, 'Cancelled')).toBe(1)
    expect(valueOf(sheet, 'No-show')).toBe(2)

    // Page footer: the note, and page numbers
    expect(sheet.headerFooter.oddFooter).toContain('Page &P of &N')
    expect(sheet.headerFooter.oddFooter).toContain('Payments count on the day they were paid, refunds on the day they were sent')

    // The file is a real workbook: it opens again with the same figures.
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(await book.xlsx.writeBuffer())
    expect(valueOf(reopened.getWorksheet('Sales Report'), 'Total received')).toBe(1650)
  })

  it('makes a daily report with one detail row for the day', () => {
    const book = buildSalesReportWorkbook(ExcelJS, { period: 'Fri, Nov 6, 2026', report: { ...report, date: '2026-11-06' } })
    const sheet = book.getWorksheet('Sales Report')
    const head = rowWith(sheet, 'Date')
    expect(sheet.getCell(`A${head + 1}`).value).toBe('Fri, Nov 6')
    expect(sheet.getCell(`A${head + 2}`).value).toBe('Grand Total')
  })

  it('says so when a month had nothing', () => {
    const days = [{ date: '2026-11-04', bookingsMade: 0, bookingsCompleted: 0, bookingsCancelled: 0, bookingsNoShow: 0, depositsCollected: 0, balancesReceived: 0, refundsSent: 0 }]
    const empty = { ...report, bookingsMade: 0, bookingsCompleted: 0, bookingsCancelled: 0, bookingsNoShow: 0, depositsCollected: 0, balancesReceived: 0, balancesUnpaid: 0, completedServicesValue: 0, refundsSent: 0, days }
    const sheet = buildSalesReportWorkbook(ExcelJS, { period: 'November 2026', report: empty }).getWorksheet('Sales Report')
    expect(sheet.getCell(`A${rowWith(sheet, 'Date') + 1}`).value).toBe('No activity in this period.')
    expect(valueOf(sheet, 'Total received')).toBe(0)
  })

  it('Reports offers the download once the figures have loaded', async () => {
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download Excel' })).toBeEnabled())
  })
})
