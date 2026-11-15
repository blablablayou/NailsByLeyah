import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, renderApp, signIn } from './helpers'

describe("Client's account menu", () => {
  it('lists My bookings and My profile first, then Rate us, then Log out on its own', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT) // Kyla has completed visits, so Rate us is offered
    renderApp('/bookings')

    await user.click(await screen.findByRole('button', { name: /Account:/ }))
    const menu = document.getElementById('nav-panel-client-account')
    const items = within(menu).getAllByRole('link').map((l) => l.textContent)
    items.push(...within(menu).getAllByRole('button').map((b) => b.textContent))

    expect(items).toEqual(['My bookings', 'My profile', 'Rate us', 'Log out'])
    // A thin line before Rate us and before Log out separates the groups.
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(2)
    expect(within(menu).getByRole('button', { name: 'Log out' }).previousElementSibling).toHaveAttribute('role', 'separator')
  })
})
