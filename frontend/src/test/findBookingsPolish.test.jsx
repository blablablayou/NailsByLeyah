import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'

const openPage = async () => {
  await signIn(ADMIN)
  renderApp('/admin/bookings')
  return screen.findByRole('table')
}

/** Booking #9 (Pending, paid deposit) gets six add-ons on both hands, like a busy nail-art set. */
function busyAddOns() {
  const db = getDb()
  const lines = [[1, 'Left', 5], [2, 'Right', 5], [3, 'Left', 5], [4, 'Right', 5], [5, 'Left', 3], [6, 'Right', 5]]
  db.bookingAddOns = db.bookingAddOns.filter((l) => l.bookingId !== 9)
  for (const [addOnId, hand, nailCount] of lines)
    db.bookingAddOns.push({ id: 900 + addOnId, bookingId: 9, addOnId, hand, nailCount, linePrice: 10 * nailCount })
  saveDb()
}

const rowOf = (id) => screen.getAllByRole('row').find((r) => r.dataset.bookingId === String(id))

describe('Find bookings polish', () => {
  it('1: Awaiting payment has its own icon, not the Pending clock', async () => {
    await openPage()
    const tabs = within(screen.getByRole('tablist', { name: 'Booking status' })).getAllByRole('tab')
    expect(tabs).toHaveLength(7)
    const icon = (name) => tabs.find((t) => t.textContent.trim().startsWith(name)).querySelector('svg').innerHTML
    expect(icon('Awaiting payment')).not.toBe(icon('Pending'))
  })

  it('2: the username stays on one line (shortened with … when too long)', async () => {
    await openPage()
    const handle = within(rowOf(9)).getByText(/^@/)
    expect(handle).toHaveClass('client-handle')
  })

  it('3: add-ons are grouped by hand, with the rest behind "+N more"', async () => {
    busyAddOns()
    const user = userEvent.setup()
    await openPage()
    const row = rowOf(9)

    const list = within(row).getByText(/^Left:/)
    expect(list).toHaveTextContent('Left: French Tip, Cat Eye Polish, Embossed Art ×3')
    expect(within(row).queryByText(/Rhinestone/)).toBeNull()
    await user.click(within(row).getByRole('button', { name: '+2 more' }))

    expect(within(row).getByText(/^Right:/)).toHaveTextContent('Right: Chrome, Blooming Gel, Rhinestone')
    expect(within(row).queryByRole('button', { name: /more$/ })).toBeNull()
  })

  it('4: the status is the same coloured badge as everywhere else', async () => {
    await openPage()
    expect(within(rowOf(9)).getByText('Pending', { selector: '.badge' })).toHaveClass('badge-pending')
  })

  it('5: the date is shown once (in the date tile); the text gives the weekday and time', async () => {
    await openPage()
    const day = within(rowOf(9)).getByText(/·/, { selector: '.when-day' })
    expect(day.textContent).toMatch(/^[A-Z][a-z]{2} · \d{1,2}:\d{2} [AP]M – \d{1,2}:\d{2} [AP]M$/)
  })

  it('A: Pending and Awaiting payment tabs show how many are waiting', async () => {
    await openPage()
    const pending = getDb().bookings.filter((b) => b.status === 'Pending' && !b.isDeleted).length
    expect(await screen.findByRole('tab', { name: new RegExp(`^Pending, ${pending} waiting$`) })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Awaiting payment$/ })).toBeInTheDocument() // none waiting: no number
  })

  it('B: a paid booking waiting for Leyah is marked for action', async () => {
    await openPage()
    const row = rowOf(9)
    expect(row).toHaveClass('needs-action')
    expect(within(row).getByText('Check payment')).toBeInTheDocument()
    expect(rowOf(8)).not.toHaveClass('needs-action') // already confirmed
  })
})
