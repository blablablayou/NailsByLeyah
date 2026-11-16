import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'
import { addDays, today } from '../lib/dates'
import { formatDate, formatTime } from '../lib/format'
import { buildIcs } from '../lib/calendar'
import { Change } from '../pages/admin/ReportsPage'

// The My bookings and Sales reports polish of 2026-11-16.

const cardFor = async (id) => {
  const b = getDb().bookings.find((x) => x.id === id)
  return screen.findByRole('listitem', { name: `${formatDate(b.bookingDate)} · ${formatTime(b.startTime)}` })
}

describe('My bookings polish', () => {
  it('shows each figure with its label, add-ons as rows, and the note only when there is one', async () => {
    await signIn(CLIENT)
    renderApp('/bookings')
    const withNote = await cardFor(8) // tomorrow, with a note and one add-on
    const money = within(withNote).getByRole('group', { name: 'Payment' })
    expect(within(money).getByText('Total').nextSibling).toHaveTextContent('₱')
    expect(within(money).getByText('Paid').nextSibling).toHaveTextContent(/\(deposit\)|\(full\)/)
    expect(within(money).getByText('Balance').nextSibling).toHaveTextContent('₱')
    expect(within(withNote).getByText("I'd like long nails")).toBeInTheDocument()
    expect(within(within(withNote).getByRole('list', { name: 'Add-ons' })).getAllByRole('listitem')).toHaveLength(1)

    const noNote = await cardFor(10)
    expect(within(noNote).queryByText(/No note/)).toBeNull()
    expect(noNote.querySelector('.booking-note')).toBeNull()
  })

  it('counts the days to each upcoming appointment', async () => {
    await signIn(CLIENT)
    renderApp('/bookings')
    expect(within(await cardFor(8)).getByText('Tomorrow')).toBeInTheDocument()
    expect(within(await cardFor(10)).getByText('In 5 days')).toBeInTheDocument()
  })

  it('offers Add to calendar on upcoming appointments only', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/bookings')
    const card = await cardFor(8)
    expect(within(card).getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument()

    const made = []
    URL.createObjectURL = (blob) => { made.push(blob); return 'blob:test' }
    URL.revokeObjectURL = () => {}
    await user.click(within(card).getByRole('button', { name: 'Add to calendar' }))
    expect(made).toHaveLength(1)
    expect(await made[0].text()).toContain('BEGIN:VEVENT')

    await user.click(screen.getByRole('tab', { name: /Completed/ }))
    expect(await screen.findAllByRole('listitem', { name: / · / })).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull()
  })

  it('builds a calendar file with the start, end, place and what was booked', () => {
    const ics = buildIcs({ id: 8, bookingDate: '2026-11-30', startTime: '18:00:00', durationMinutes: 180, serviceName: 'Soft Gel Extension',
      removalServiceName: 'My Work' }, { now: new Date('2026-11-16T00:00:00Z') })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART;TZID=Asia/Manila:20261130T180000')
    expect(ics).toContain('DTEND;TZID=Asia/Manila:20261130T210000')
    expect(ics).toContain('SUMMARY:Nails by Leyah: Soft Gel Extension + Removal (My Work)')
    expect(ics).toContain('UID:booking-8@nailsbyleyah')
    expect(ics.split('\r\n').at(-2)).toBe('END:VCALENDAR')
    expect(ics).toContain('SEQUENCE:0')
  })

  it('uses the end time from the booking, and folds long lines', () => {
    const ics = buildIcs({ id: 9, bookingDate: '2026-11-30', startTime: '09:00:00', endTime: '12:00:00', rescheduleCount: 2,
      serviceName: 'Soft Gel Extension with Design', removalServiceName: 'Soft Gel Extension' })
    expect(ics).toContain('DTEND;TZID=Asia/Manila:20261130T120000')
    expect(ics).toContain('SEQUENCE:2')
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
    expect(ics.replace(/\r\n /g, '')).toContain('SUMMARY:Nails by Leyah: Soft Gel Extension with Design + Removal (Soft Gel Extension)')
  })
})

describe('Sales reports polish', () => {
  it('jumps back to today, and to this month', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/reports')
    expect(await screen.findByRole('heading', { name: formatDate(today()) })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull() // already on today
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    await user.click(await screen.findByRole('button', { name: 'Today' }))
    expect(await screen.findByRole('heading', { name: formatDate(today()) })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Monthly' }))
    await user.click(await screen.findByRole('button', { name: 'Previous month' }))
    await user.click(await screen.findByRole('button', { name: 'This month' }))
    const thisMonth = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    expect(await screen.findByRole('heading', { name: thisMonth })).toBeInTheDocument()
  })

  it('compares the money with the day before', async () => {
    await signIn(ADMIN)
    renderApp('/admin/reports')
    const total = await screen.findByRole('group', { name: 'Net received' })
    const short = new Date(`${addDays(today(), -1)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    expect(await within(total).findByText(new RegExp(`(vs|Same as) ${short}$`))).toBeInTheDocument()
    expect(within(total).getByText(`Today so far, compared with the whole of ${short}`)).toBeInTheDocument()
  })

  it('charts the money received on each day of the month', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await user.click(await screen.findByRole('tab', { name: 'Monthly' }))
    const chart = await screen.findByRole('img', { name: /Money received each day/ })
    const days = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    expect(chart.querySelectorAll('.report-bar')).toHaveLength(days)
    expect(screen.getByRole('table', { name: 'Money received each day' }).querySelectorAll('tbody tr')).toHaveLength(days)
  })

  it('says so when a day has nothing, and still shows the figures', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await screen.findByRole('heading', { name: formatDate(today()) })
    await user.click(screen.getByRole('button', { name: /^Day: .*Change date$/ }))
    // Far enough ahead that nothing is booked (the demo data runs a week ahead).
    for (let i = 0; i < 2; i += 1) await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Next month/ }))
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: /^\w{3}, \w{3} 15, \d{4}/ })[0])
    expect(await screen.findByText('Nothing was paid or booked on this day.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Net received' })).toBeInTheDocument()
  })
})

describe('Report comparisons', () => {
  it('shows a rise as better, but a rise in unpaid balances as worse', () => {
    const { unmount } = render(<Change now={500} before={200} label="Nov 14" />)
    expect(screen.getByText('↑ ₱300.00 vs Nov 14')).toHaveClass('better')
    unmount()
    render(<Change now={500} before={200} label="Nov 14" lowerIsBetter />)
    expect(screen.getByText('↑ ₱300.00 vs Nov 14')).toHaveClass('worse')
  })

  it('says when nothing changed, and shows nothing without the earlier figures', () => {
    const { unmount } = render(<Change now={0} before={0} label="October" />)
    expect(screen.getByText('Same as October')).toBeInTheDocument()
    unmount()
    const empty = render(<Change now={10} before={null} label="October" />)
    expect(empty.container).toBeEmptyDOMElement()
  })
})
