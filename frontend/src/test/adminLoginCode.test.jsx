import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp } from './helpers'
import { getDb, saveDb } from './mockBackend/db'

/** Turns Leyah's email code on in the mock backend (it is off unless a test asks). */
function codeOn() {
  const db = getDb()
  db.flags.adminLoginCode = true
  saveDb()
}

const latestCode = () => getDb().outbox.find((m) => m.subject.startsWith('Your Nails by Leyah sign-in code'))?.code

async function enterPassword(user, account) {
  await user.type(await screen.findByLabelText(/Username or email/), account.username)
  await user.type(screen.getByLabelText(/^Password/), account.password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

describe("Leyah's sign-in code", () => {
  it('asks for the code from her email after the password, then opens her dashboard', async () => {
    codeOn()
    const user = userEvent.setup()
    renderApp('/login')

    await enterPassword(user, ADMIN)

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/We sent a 6-digit code to/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Remember this device for 30 days' })).toBeChecked()
    await user.type(screen.getByLabelText('6-digit code'), latestCode())
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('says so when the code is wrong, and stays on the code step', async () => {
    codeOn()
    const user = userEvent.setup()
    renderApp('/login')
    await enterPassword(user, ADMIN)
    await screen.findByRole('heading', { name: 'Check your email' })
    const wrong = latestCode() === '000000' ? '111111' : '000000'

    await user.type(screen.getByLabelText('6-digit code'), wrong)
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText("That code isn't right. Check the email and try again.")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  })

  it('Back returns to the password form', async () => {
    codeOn()
    const user = userEvent.setup()
    renderApp('/login')
    await enterPassword(user, ADMIN)
    await screen.findByRole('heading', { name: 'Check your email' })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('a client signs in with the password alone', async () => {
    codeOn()
    const user = userEvent.setup()
    renderApp('/login')

    await enterPassword(user, CLIENT)

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Check your email' })).toBeNull()
  })
})
