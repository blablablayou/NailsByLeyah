import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'

const me = () => getDb().users.find((u) => u.username === CLIENT.username)
const card = () => screen.getByRole('heading', { name: 'Delete my account' }).closest('section.card')

describe('Delete my account', () => {
  it('asks with the password, tells Leyah, and can be taken back', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')

    await user.click(await screen.findByRole('button', { name: 'Request deletion' }))
    await user.type(within(card()).getByLabelText(/^Password/), 'Wrong12345')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText("That isn't your current password.")).toBeInTheDocument()

    await user.clear(within(card()).getByLabelText(/^Password/))
    await user.type(within(card()).getByLabelText(/^Password/), CLIENT.password)
    await user.type(within(card()).getByLabelText(/Reason/), 'Moving abroad')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText(/Your request was sent/)).toBeInTheDocument()
    expect(screen.getByText(/You asked for your account to be deleted on/)).toBeInTheDocument()
    expect(getDb().outbox.some((m) => m.subject.startsWith('Data deletion request'))).toBe(true)
    expect(me().isDeleted).toBeFalsy() // nothing is deleted until Leyah does it

    await user.click(screen.getByRole('button', { name: 'Keep my account' }))
    expect(await screen.findByText(/Your request was canceled/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request deletion' })).toBeInTheDocument()
  })

  it('shows Leyah the request on Client data, with the reason', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')
    await user.click(await screen.findByRole('button', { name: 'Request deletion' }))
    await user.type(within(card()).getByLabelText(/^Password/), CLIENT.password)
    await user.type(within(card()).getByLabelText(/Reason/), 'Moving abroad')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await screen.findByText(/Your request was sent/)

    await signIn(ADMIN)
    renderApp('/admin/clients')
    const requests = (await screen.findByRole('heading', { name: 'Deletion requests' })).closest('section.card')
    expect(within(requests).getByText(/Reason: Moving abroad/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Open deletion request from @${CLIENT.username}` }))
    expect(await screen.findByText('This client asked for their data to be deleted.')).toBeInTheDocument()
  })

  it('is not offered to Leyah on her own profile', async () => {
    await signIn(ADMIN)
    renderApp('/profile')
    await screen.findByRole('heading', { name: 'My profile' })
    expect(screen.queryByRole('heading', { name: 'Delete my account' })).toBeNull()
  })
})
