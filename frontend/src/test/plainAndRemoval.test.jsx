import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, renderApp, signIn } from './helpers'

describe('Home page price cards', () => {
  it('shows how long a removal takes, like the sets do', async () => {
    renderApp('/')
    const card = (await screen.findByRole('heading', { name: 'Removal' })).closest('article, li, div')
    expect(within(card).getByText('1 hr')).toBeInTheDocument()
  })
})

describe('FAQ', () => {
  it('says the deposit comes back in full when the salon cancels', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Is the reservation deposit refundable?' }))
    expect(screen.getByText(/if the salon cancels your booking, you get everything back, the deposit included/)).toBeInTheDocument()
  })
})

describe('Design photos on the booking page', () => {
  it('are locked for Plain, which takes no design, and open for a set that does', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    // Still in place, grayed out and not clickable.
    expect(screen.getByRole('checkbox', { name: /With Design/ })).toBeDisabled()
    expect(screen.getByLabelText(/Design reference photos/, { selector: 'input' })).toBeDisabled()
    expect(screen.getByText('Add photo').closest('.reference-picker')).toHaveClass('is-locked')
    expect(screen.getByText(/Design photos are for sets with a design\. Plain is one plain color\./)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /^BIAB/ }))
    expect(screen.getByRole('checkbox', { name: /With Design/ })).toBeEnabled()
    expect(screen.getByText('Add photo').closest('.reference-picker')).not.toHaveClass('is-locked')
  })
})
