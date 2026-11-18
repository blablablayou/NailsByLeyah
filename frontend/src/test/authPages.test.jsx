import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, renderApp } from './helpers'
import { getDb } from './mockBackend/db'

describe('Registration', () => {
  it('shows "Username is already taken." for an existing username (7.4)', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText(/^Username/), CLIENT.username)

    expect(await screen.findByText('Username is already taken.')).toBeInTheDocument()
  })

  it('shows no counters or format hints, and warns about a wrong field once the user leaves it', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    const email = await screen.findByLabelText(/^Email address/)

    expect(screen.queryByText(/\/75/)).toBeNull()
    expect(screen.queryByText(/\/11 digits/)).toBeNull()
    expect(screen.queryByText(/3–50 characters/)).toBeNull()
    expect(email).not.toHaveAttribute('placeholder')

    // Leaving an empty field says nothing; leaving a wrong one says what is wrong.
    await user.click(email)
    await user.tab()
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
    await user.type(email, 'kyla@')
    await user.type(screen.getByLabelText(/^Username/), 'ky')
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Username must be 3 to 50 characters.')).toBeInTheDocument()

    // Fixing it clears the warning while typing.
    await user.type(email, 'gmail.com')
    expect(screen.queryByText('Enter a valid email address.')).toBeNull()
  })

  it('says that creating an account agrees to the Terms & Conditions and Privacy Policy, with no checkbox', async () => {
    renderApp('/register')
    const submit = await screen.findByRole('button', { name: 'Create account' })
    expect(submit).toBeEnabled() // nothing to tick first
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(/By creating an account, you agree to Nails by Leyah/)).toHaveTextContent(
      'By creating an account, you agree to Nails by Leyah’s Terms & Conditions and Privacy Policy.')
  })

  it('opens each document from its link, to read', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    const line = (await screen.findByText(/By creating an account/)).closest('p')

    await user.click(within(line).getByRole('button', { name: 'Terms & Conditions' }))
    const terms = await screen.findByRole('dialog', { name: 'Terms & Conditions' })
    expect(terms).toHaveTextContent('Version 2.5')
    expect(within(terms).queryByRole('button', { name: 'Agree and continue' })).toBeNull() // only to read
    await user.keyboard('{Escape}')

    await user.click(within(line).getByRole('button', { name: 'Privacy Policy' }))
    expect(await screen.findByRole('dialog', { name: 'Privacy Policy' })).toHaveTextContent('Version 2.4')
  })

  it('the footer opens the Terms & Conditions and Privacy Policy on every page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    const footer = await screen.findByRole('navigation', { name: 'Footer' })

    await user.click(within(footer).getByRole('button', { name: 'Terms & Conditions' }))
    expect(screen.getByRole('dialog', { name: 'Terms & Conditions' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0])
    await user.click(within(footer).getByRole('button', { name: 'Privacy Policy' }))
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(within(footer).queryByRole('link', { name: 'Support' })).not.toBeInTheDocument()
  })

  it('registers, then verifies the email with the code from the inbox', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText(/First Name/), 'Bea')
    await user.type(screen.getByLabelText(/Last Name/), 'Torres')
    await user.type(screen.getByLabelText(/^Username/), 'bea.torres')
    await user.type(screen.getByLabelText(/Email address/), 'bea@example.test')
    await user.type(screen.getByLabelText(/Phone Number/), '09223334444')
    await user.type(screen.getByLabelText(/^Password( \*)?$/), 'BeaPass123')
    await user.type(screen.getByLabelText(/Confirm Password/), 'BeaPass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
    // Creating the account recorded the agreement to the current Terms.
    expect(getDb().users.find((u) => u.username === 'bea.torres').termsAcceptedAt).toBeTruthy()
    const code = getDb().outbox.find((e) => e.to === 'bea@example.test').code
    await user.type(screen.getByLabelText(/Verification code/), code)
    await user.click(screen.getByRole('button', { name: 'Verify email' }))

    // Registration complete: the landing page welcomes the new client.
    expect(await screen.findByText('Your account is ready!')).toBeInTheDocument()
    expect(screen.getByText('Your account is ready!').closest('.hm-welcome')).toHaveTextContent('Log in to book your first appointment')
    expect(screen.queryByRole('heading', { name: 'Verify your email' })).toBeNull()
  })
})

describe('Reset Password page (7.5)', () => {
  it('says so straight away when the link has expired', async () => {
    renderApp('/reset-password#token=expired-demo-token')
    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument()
  })

  it('says so when the link was already used', async () => {
    renderApp('/reset-password?token=used-demo-token')
    expect(await screen.findByText('This link cannot be used')).toBeInTheDocument()
  })

  it('changes the password with a fresh link from Forgot Password', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')
    await user.type(await screen.findByLabelText(/Email address/), 'kyla@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByText(/a password reset link has been sent/)

    const link = new URL(getDb().outbox.find((e) => e.link).link)
    expect(link.search).toBe('') // the token travels after "#", never in the part sent to the server
    renderApp(link.pathname + link.hash)
    // The current password is refused; the link still works for a different one.
    await user.type(await screen.findByLabelText(/^New password/), CLIENT.password)
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Your new password must be different from your current password.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^New password/))
    await user.type(screen.getByLabelText(/^New password/), 'NewSecret123')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument()
  })
})

describe('Login', () => {
  it('shows the lockout message after five failed attempts (Ref 8.3)', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText(/Username or email/), CLIENT.username)
    const password = screen.getByLabelText(/^Password( \*)?$/)
    const submit = screen.getByRole('button', { name: 'Log in' })

    for (let attempt = 1; attempt <= 5; attempt++) {
      await user.clear(password)
      await user.type(password, `Wrong${attempt}pass`)
      await user.click(submit)
      await waitFor(() => expect(submit).toBeEnabled())
    }

    expect(await screen.findByText('Account locked')).toBeInTheDocument()
    expect(screen.getByText(/try again in 15 minutes/)).toBeInTheDocument()
  })

  it('sends a client to the landing page after logging in', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText(/Username or email/), CLIENT.username)
    await user.type(screen.getByLabelText(/^Password( \*)?$/), CLIENT.password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'Beautiful Nails, Beautiful You.' })).toBeInTheDocument()
  })
})
