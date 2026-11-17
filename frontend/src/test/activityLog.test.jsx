import { screen, within } from '@testing-library/react'
import { ADMIN, renderApp, signIn } from './helpers'

describe('Activity log filter', () => {
  it('offers every kind of entry, the money and sign-in ones included', async () => {
    await signIn(ADMIN)
    renderApp('/admin/activity')

    const filter = await screen.findByRole('combobox', { name: 'Show' })
    for (const name of ['Refund Sent', 'Refund Failed', 'Balance Received', 'Booking No Show', 'Login Code Sent',
      'Login Code Failed', 'Feedback Shown On Home', 'Password Changed']) {
      expect(within(filter).getByRole('option', { name })).toBeInTheDocument()
    }
  })
})
