import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'

/** The admin Feedback page's row for one comment. */
const rowWith = async (text) => (await screen.findByText(text)).closest('li')

const whatClientsSay = () => screen.queryByRole('region', { name: 'What clients say' })

describe('Client ratings on the home page', () => {
  it('shows nothing until Leyah picks a comment', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: 'Our Works' })
    await waitFor(() => expect(whatClientsSay()).toBeNull())
  })

  it('Leyah switches a comment on, and the home page shows it with the first name, last initial and the average', async () => {
    const user = userEvent.setup()
    const db = getDb()
    const author = db.users.find((u) => u.id === db.feedback.find((f) => f.id === 3).clientId)
    await signIn(ADMIN)
    const { unmount } = renderApp('/admin/feedback')

    const row = await rowWith('Very gentle removal and a lovely design.')
    const toggle = within(row).getByRole('checkbox', { name: 'Show on home page' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(await screen.findByText('1 of 6 shown on the home page.')).toBeInTheDocument()
    unmount()

    renderApp('/')
    const section = await screen.findByRole('region', { name: 'What clients say' })
    expect(within(section).getByText(/Very gentle removal and a lovely design\./)).toBeInTheDocument()
    expect(within(section).getByText(`${author.firstName} ${author.lastName[0]}.`)).toBeInTheDocument()
    expect(within(section).queryByText(author.lastName)).toBeNull()
    expect(within(section).getByText(/4\.7 from 3 ratings/)).toBeInTheDocument()
  })

  it('a rating without a comment has no switch', async () => {
    await signIn(ADMIN)
    renderApp('/admin/feedback')
    await screen.findByText('Very gentle removal and a lovely design.')
    const bare = screen.getAllByText('No comment')[0].closest('li')
    expect(within(bare).queryByRole('checkbox', { name: 'Show on home page' })).toBeNull()
  })

  it('says so when six are already shown, and leaves the switch off', async () => {
    const user = userEvent.setup()
    const db = getDb()
    for (let i = 0; i < 6; i += 1) {
      db.feedback.push({ id: 100 + i, clientId: 2, rating: 5, comment: `Shown ${i}`, submissionKey: `full-${i}`,
        createdAt: `2026-11-0${i + 2}T08:00:00.000Z`, showOnHome: true })
    }
    saveDb()
    await signIn(ADMIN)
    renderApp('/admin/feedback')

    const toggle = within(await rowWith('Very gentle removal and a lovely design.')).getByRole('checkbox', { name: 'Show on home page' })
    await user.click(toggle)

    expect(await screen.findByText(/The home page shows up to 6 comments/)).toBeInTheDocument()
    expect(toggle).not.toBeChecked()
  })

  it('tells the client before they send that a comment may go on the home page', async () => {
    await signIn(CLIENT)
    renderApp('/feedback')
    expect(await screen.findByText('Leyah may show your comment on the home page with your first name and last initial.')).toBeInTheDocument()
  })
})
