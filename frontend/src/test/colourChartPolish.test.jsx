import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, pickShade, renderApp, signIn } from './helpers'

// The colour chart polish of 2026-11-16: quick compare, one Tab stop, the locked right hand explained, and the phone
// header and Use bar.

const chart = () => screen.getByRole('dialog', { name: 'Choose Nail Colour' })
const shade = (n) => within(chart()).getByRole('radio', { name: new RegExp(`^Shade #${n},`) })

async function openChart(user) {
  await signIn(CLIENT)
  renderApp('/book')
  await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
  await user.click(screen.getByRole('button', { name: 'Open the colour chart' }))
}

describe('Colour chart polish', () => {
  it('spells colour the same way everywhere', async () => {
    const user = userEvent.setup()
    await openChart(user)
    expect(within(chart()).getByRole('button', { name: 'Use This Colour' })).toBeDisabled()
    expect(within(chart()).getByText(/No colour selected yet/)).toBeInTheDocument()
  })

  it('previews a shade on hover without choosing it', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.hover(shade('41'))
    expect(within(chart()).getByRole('heading', { name: 'Bubblegum Pink' })).toBeInTheDocument()
    expect(within(chart()).getByText('Previewing')).toBeInTheDocument()
    expect(shade('41')).not.toBeChecked()
    expect(within(chart()).getByRole('button', { name: 'Use This Colour' })).toBeDisabled()

    await user.unhover(shade('41'))
    expect(within(chart()).getByText(/No colour selected yet/)).toBeInTheDocument()
  })

  it('previews on a long press without choosing', async () => {
    const user = userEvent.setup()
    await openChart(user)
    fireEvent.pointerDown(shade('41'), { pointerType: 'touch' })
    await new Promise((r) => setTimeout(r, 600))
    expect(within(chart()).getByRole('heading', { name: 'Bubblegum Pink' })).toBeInTheDocument()
    fireEvent.pointerUp(shade('41'), { pointerType: 'touch' })
    fireEvent.click(shade('41'))
    expect(shade('41')).not.toBeChecked()

    // An ordinary tap still chooses.
    await user.click(shade('41'))
    expect(shade('41')).toBeChecked()
  })

  it('is one Tab stop; arrow keys move between shades without choosing', async () => {
    const user = userEvent.setup()
    await openChart(user)
    const tabbable = within(chart()).getAllByRole('radio').filter((r) => r.closest('.cp-grid') && r.tabIndex === 0)
    expect(tabbable).toHaveLength(1)

    shade('06').focus()
    await user.keyboard('{ArrowRight}')
    expect(shade('07')).toHaveFocus()
    expect(shade('07')).not.toBeChecked()
    await user.keyboard('{ArrowDown}')
    expect(shade('17')).toHaveFocus()
    await user.keyboard('{End}')
    expect(shade('58')).toHaveFocus()
    await user.keyboard('{Home}')
    expect(shade('01')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(shade('01')).toBeChecked()
    expect(shade('01').tabIndex).toBe(0)
  })

  it('opens every nail on both hands, and says empty nails get the main colour', async () => {
    const user = userEvent.setup()
    await openChart(user)
    expect(within(chart()).getByRole('button', { name: /^Right hand, little/ })).toBeEnabled()
    expect(within(chart()).queryByText('Opens after all 5 left nails')).toBeNull()
    expect(within(chart()).getByText(/Nails you leave empty get your main colour/)).toBeInTheDocument()
    expect(within(chart()).getByText('Other options')).toBeInTheDocument()
  })

  it('keeps the title, the choice and the Use button outside the scrolling chart', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.click(shade('06'))
    const dialog = chart()
    const head = dialog.querySelector(':scope > .cp-head')
    expect(within(head).getByRole('heading', { name: 'Choose Nail Colour' })).toBeInTheDocument()
    expect(head.querySelector('.cp-now')).toHaveTextContent('Selected: #06 Light Pink-Lavender')
    expect(dialog.querySelector(':scope > .cp-usebar')).toContainElement(within(dialog).getByRole('button', { name: 'Use This Colour' }))
  })

  // Review fixes, 2026-11-16.
  it('does not preview shades that cannot be chosen', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.click(within(chart()).getByRole('radio', { name: 'Not sure yet (decide at the salon)' }))
    fireEvent.pointerOver(shade('41'), { pointerType: 'mouse' }) // React's pointer enter
    fireEvent.pointerDown(shade('41'), { pointerType: 'touch' })
    await new Promise((r) => setTimeout(r, 600))
    expect(within(chart()).queryByText('Previewing')).toBeNull()
    expect(within(chart()).queryByRole('heading', { name: 'Bubblegum Pink' })).toBeNull()
  })

  it('a long press never blocks choosing the same shade later with the keyboard', async () => {
    const user = userEvent.setup()
    await openChart(user)
    fireEvent.pointerDown(shade('41'), { pointerType: 'touch' })
    await new Promise((r) => setTimeout(r, 600))
    fireEvent.pointerUp(shade('41'), { pointerType: 'touch' })
    expect(within(chart()).queryByText('Previewing')).toBeNull() // letting go ends the preview
    await new Promise((r) => setTimeout(r, 600)) // no click followed the long press (as on Android)
    shade('41').focus()
    await user.keyboard('{Enter}')
    expect(shade('41')).toBeChecked()
  })

  it('only announces real choices, not previews', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.hover(shade('41'))
    expect(chart().querySelector('.cp-pick')).toHaveAttribute('aria-live', 'off')
    await user.unhover(shade('41'))
    expect(chart().querySelector('.cp-pick')).toHaveAttribute('aria-live', 'polite')
  })

  it('arrow keys never colour a nail', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.click(within(chart()).getByRole('button', { name: /^Left hand, thumb/ }))
    shade('06').focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}{End}')
    expect(within(chart()).getByRole('button', { name: 'Left hand, thumb: choose a colour' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chart()).getAllByRole('button', { name: /: choose a colour$/ })).toHaveLength(10)
  })

  it('opens with focus on the chosen shade', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')
    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await pickShade(user, 30)
    await user.click(screen.getByRole('button', { name: /^Colour #30.*Change colour$/ }))
    expect(shade('30')).toHaveFocus()
  })

  it('the header line matches the Use button when asking for a colour after starting the nails', async () => {
    const user = userEvent.setup()
    await openChart(user)
    await user.click(within(chart()).getByRole('button', { name: /^Left hand, thumb/ }))
    await user.click(shade('06'))
    await user.click(within(chart()).getByRole('radio', { name: "Can't find your colour?" }))
    expect(within(chart()).getByRole('button', { name: 'Ask Leyah for This Colour' })).toBeInTheDocument()
    expect(chart().querySelector('.cp-now')).toHaveTextContent('Selected: Colour request')
  })
})
