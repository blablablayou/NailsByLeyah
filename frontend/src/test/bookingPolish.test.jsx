import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, pickDate, pickShade, renderApp, signIn } from './helpers'
import { dateFromToday } from '../lib/dates'

// The booking page polish of 2026-11-16: clickable finished steps, the total in the phone bar, jumps from Your total,
// and options that don't apply folded into one line.

const stepBar = () => screen.getByRole('list', { name: 'Booking steps' })

async function plainWithColour(user) {
  await signIn(CLIENT)
  renderApp('/book')
  await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
  await pickShade(user, 30)
}

describe('Booking page polish', () => {
  it('goes back to a finished step from the step bar, never forward', async () => {
    const user = userEvent.setup()
    await plainWithColour(user)
    // On step 1 nothing is finished yet: no step is a button.
    expect(within(stepBar()).queryAllByRole('button')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    expect(await screen.findByRole('heading', { name: /Choose a date/ })).toBeInTheDocument()
    // Step 1 is finished: it can be opened; step 2 (current) and step 3 (later) cannot.
    expect(within(stepBar()).getAllByRole('button').map((b) => b.textContent)).toEqual(['1 Service'])
    await user.click(within(stepBar()).getByRole('button', { name: /Service/ }))
    expect(await screen.findByRole('heading', { name: 'Choose a service' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^Plain/ })).toBeChecked() // nothing was lost
  })

  it('shows the total beside Next in the bar that stays on screen on phones', async () => {
    const user = userEvent.setup()
    await plainWithColour(user)
    const bar = document.querySelector('.summary-next')
    expect(within(bar).getByText(/₱300\.00/)).toBeInTheDocument()
    expect(within(bar).getByText(/total/)).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /^Next:/ })).toBeInTheDocument()
  })

  it('jumps from Your total back to the color, and on to the appointment', async () => {
    const user = userEvent.setup()
    await plainWithColour(user)
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    pickDate(dateFromToday(3))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))

    const total = screen.getByRole('complementary')
    await user.click(within(total).getByRole('button', { name: 'Change color' }))
    expect(await screen.findByRole('heading', { name: 'Choose a color' })).toBeInTheDocument()

    await user.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Change appointment' }))
    expect(await screen.findByRole('heading', { name: /Choose a date/ })).toBeInTheDocument()
  })

  it('folds design and nail art into a line when they do not apply', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')
    await screen.findByRole('checkbox', { name: /^Plain/ })
    // No service yet: nail art waits for one, without a wall of grayed photos.
    expect(screen.getByText('Choose a service to add nail art.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Chrome/ })).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: /^Plain/ }))
    expect(screen.getByText("Designs aren't available with Plain.")).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^With Design/ })).toBeNull()
    expect(screen.getByText("Nail art isn't available with Plain. Choose another service to add it.")).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Chrome/ })).toBeNull()
    // The design photos stay: they help Leyah with any set.
    expect(screen.getByText(/Design reference photos/)).toBeInTheDocument()
  })
})
