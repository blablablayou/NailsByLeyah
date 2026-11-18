import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, readTermsAndAgree, renderApp, signIn, pickDate } from './helpers'
import { getDb } from './mockBackend/db'
import { dateFromToday } from '../lib/dates'

// Leyah's revisions of 2026-11-12 on the booking page.

async function payFromServiceStep(user) {
  await user.click(screen.getByRole('button', { name: /^Next:/ }))
  pickDate(dateFromToday(3))
  await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))
  await user.click(screen.getByRole('button', { name: /^Next:/ }))
  await readTermsAndAgree(user)
  await user.click(screen.getByRole('button', { name: /^Pay/ }))
  expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
}

const shade = (chart, n) => within(chart).getByRole('radio', { name: new RegExp(`^Shade #${n},`) })

describe('Booking revisions', () => {
  it('shows the services in order, then an optional Design section with one "With Design" card for Soft Gel Extension and BIAB', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    expect(await screen.findByRole('heading', { name: 'Services' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Design (optional)' })).toBeInTheDocument()
    const names = [...document.querySelectorAll('.service-photos .choice-name, .design-card .choice-name')].map((n) => n.textContent)
    expect(names).toEqual(['Plain', 'Soft Gel Extension', 'BIAB', 'With Design'])

    await user.click(screen.getByRole('checkbox', { name: /^BIAB/ }))
    await user.click(screen.getByRole('checkbox', { name: /^With Design/ }))
    const aside = within(screen.getByRole('complementary'))
    expect(aside.getByText('Total').nextSibling).toHaveTextContent('₱350.00')
    expect(screen.getByRole('checkbox', { name: /^BIAB/ })).toBeChecked() // the BIAB card stays chosen
    expect(screen.getByRole('heading', { name: 'Nail Art (add-ons)' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Rhinestone/ })).toBeEnabled()

    // Soft Gel Extension with Design: ₱399 + ₱100, 2 hours + 1.
    await user.click(screen.getByRole('checkbox', { name: /^Soft Gel Extension/ }))
    await user.click(screen.getByRole('checkbox', { name: /^With Design/ }))
    expect(aside.getByText('Total').nextSibling).toHaveTextContent('₱499.00')
    expect(aside.getByText('~ 3 hr')).toBeInTheDocument()

    // Plain has no design version.
    await user.click(screen.getByRole('checkbox', { name: /^Plain/ }))
    expect(screen.queryByRole('checkbox', { name: /^With Design/ })).toBeNull() // folded into the line below
    expect(screen.getByText("Designs aren't available with Plain.")).toBeInTheDocument()
  })

  it('keeps an add-on at 1 nail; only × removes it', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Rhinestone/ }))
    await user.click(screen.getByRole('radio', { name: 'Left hand' }))
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: 'Fewer nails for Rhinestone' }))
    expect(screen.getByText('1 nail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fewer nails for Rhinestone' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove Rhinestone' }))
    expect(screen.getByRole('checkbox', { name: /Rhinestone/ })).not.toBeChecked()
  })

  it("books a color that isn't on the chart as a request waiting for Leyah", async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await user.click(screen.getByRole('button', { name: 'Open the color chart' }))
    const chart = screen.getByRole('dialog', { name: 'Choose Nail Color' })
    await user.click(within(chart).getByRole('radio', { name: "Can't find your color?" }))
    expect(within(chart).getByRole('button', { name: 'Ask Leyah for This Color' })).toBeDisabled()
    expect(within(chart).getByText(/Describe the color you're looking for/)).toBeInTheDocument()

    await user.type(within(chart).getByLabelText(/Describe the color you'd like/), 'Dusty sage green')
    await user.click(within(chart).getByRole('button', { name: 'Ask Leyah for This Color' }))
    expect(screen.getByRole('button', { name: 'Color request. Change color' })).toHaveTextContent('Dusty sage green')
    expect(screen.getByLabelText(/Photo of the color/)).toBeInTheDocument() // the photo is added on the page
    await payFromServiceStep(user)

    expect(getDb().bookings.at(-1)).toMatchObject({ nailColor: null, colorRequest: 'Dusty sage green', colorRequestStatus: 'Pending' })
  })

  it('takes a color for as few nails as the client likes, on either hand, with the main color for the rest', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await user.click(screen.getByRole('button', { name: 'Open the color chart' }))
    const chart = screen.getByRole('dialog', { name: 'Choose Nail Color' })

    // One nail on the right hand, straight away: tap the nail, then a shade.
    await user.click(within(chart).getByRole('button', { name: /^Right hand, ring/ }))
    await user.click(shade(chart, '30'))
    expect(within(chart).getByRole('button', { name: 'Use These Colors' })).toBeDisabled()
    expect(within(chart).getByText(/Tap a shade for your other nails/)).toBeInTheDocument()

    // A shade with no nail tapped is the main color for the other nine.
    await user.click(shade(chart, '06'))
    await user.click(within(chart).getByRole('button', { name: 'Use These Colors' }))
    await payFromServiceStep(user)

    const booking = getDb().bookings.at(-1)
    expect(booking.nailColor).toBe('#06')
    expect(booking.perNailColors).toEqual({ left: [null, null, null, null, null], right: [null, null, null, '#30', null] })
  })
})
