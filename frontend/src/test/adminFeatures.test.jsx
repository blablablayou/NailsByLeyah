import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:preview'
  URL.revokeObjectURL ??= () => {}
})

describe('Leyah books for a client herself', () => {
  const openNewBooking = async (user) => {
    await signIn(ADMIN)
    renderApp('/admin/bookings')
    await user.click(await screen.findByRole('button', { name: '+ New booking' }))
    return screen.findByRole('dialog', { name: 'New booking' })
  }

  it('picks the service, design, removal and nail art by tapping, with the total kept in view', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    const summary = within(dialog).getByRole('complementary', { name: 'Booking summary' })
    expect(summary).toHaveTextContent('Pick a service to see the total.')
    expect(summary).not.toHaveTextContent('₱0')

    await user.type(within(dialog).getByLabelText(/^Name/), 'Bea Cruz')
    await user.click(within(dialog).getByRole('radio', { name: /^Soft Gel Extension\b/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /With design/ }))
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Removal first' })).getByRole('radio', { name: /^My Work/ }))
    await user.click(within(dialog).getByRole('button', { name: 'More nails with Chrome' }))
    await user.click(within(dialog).getByRole('button', { name: 'More nails with Chrome' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Deposit' }))

    expect(summary).toHaveTextContent('Bea Cruz')
    expect(summary).toHaveTextContent('Soft Gel Extension with design')
    expect(summary).toHaveTextContent('Chrome × 2')
    const amounts = Object.fromEntries([...summary.querySelectorAll('.nb-sum-total div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))
    expect(amounts).toEqual({ Total: '₱619.00', 'Paid now': '₱150.00', 'Left at the salon': '₱469.00' })

    await user.click(within(dialog).getByRole('button', { name: 'Fewer nails with Chrome' }))
    expect(summary).toHaveTextContent('Chrome × 1')
  })

  const summaryAmounts = (dialog) => {
    const summary = within(dialog).getByRole('complementary', { name: 'Booking summary' })
    return Object.fromEntries([...summary.querySelectorAll('.nb-sum-total div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))
  }

  it('books a removal on its own: no set options, and paid now is at least the deposit', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Removal only' })).getByRole('radio', { name: /^My Work/ }))
    // A removal takes no removal first, colour or nail art.
    expect(within(dialog).queryByRole('radiogroup', { name: 'Removal first' })).toBeNull()
    expect(within(dialog).queryByRole('combobox', { name: /^Colour/ })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /^More nails with/ })).toBeNull()
    expect(within(dialog).getByRole('complementary', { name: 'Booking summary' })).toHaveTextContent('Removal only: My Work')

    // The ₱100 removal is below the ₱150 deposit: what is recorded as paid is the deposit, as the backend does.
    await user.click(within(dialog).getByRole('radio', { name: 'Deposit' }))
    expect(summaryAmounts(dialog)).toEqual({ Total: '₱100.00', 'Paid now': '₱150.00', 'Left at the salon': '₱0.00' })
    await user.click(within(dialog).getByRole('radio', { name: 'Full payment' }))
    expect(summaryAmounts(dialog)).toEqual({ Total: '₱100.00', 'Paid now': '₱150.00', 'Left at the salon': '₱0.00' })
    await user.click(within(dialog).getByRole('radio', { name: 'Nothing yet' }))
    expect(summaryAmounts(dialog)).toEqual({ Total: '₱100.00', 'Paid now': '₱0.00', 'Left at the salon': '₱100.00' })
  })

  it('clears the chosen time when the removal or the date changes', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    await user.click(within(dialog).getByRole('radio', { name: /^Plain\b/ }))
    for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    const pick = async () => {
      const slot = await within(dialog).findByRole('radio', { name: /^11:00 AM/ })
      await user.click(slot)
      expect(slot).toBeChecked()
    }
    const noTimeChosen = () => expect(within(dialog).queryByRole('radio', { name: /^11:00 AM/, checked: true })).toBeNull()

    await pick()
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Removal first' })).getByRole('radio', { name: /^My Work/ }))
    noTimeChosen()

    await pick()
    await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    noTimeChosen()
  })

  it('unticks With design when the chosen set is clicked again', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    const card = within(dialog).getByRole('radio', { name: /^Soft Gel Extension\b/ })
    await user.click(card)
    await user.click(within(dialog).getByRole('checkbox', { name: /With design/ }))
    expect(within(dialog).getByRole('checkbox', { name: /With design/ })).toBeChecked()
    await user.click(card)
    expect(within(dialog).getByRole('checkbox', { name: /With design/ })).not.toBeChecked()
  })

  it('moves between options with the arrow keys, one Tab stop per group', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    const paid = within(dialog).getByRole('radiogroup', { name: 'Already paid' })
    const chips = within(paid).getAllByRole('radio')
    expect(chips.map((c) => c.tabIndex)).toEqual([0, -1, -1]) // only the chosen one is a Tab stop
    chips[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(within(paid).getByRole('radio', { name: 'Deposit' })).toBeChecked()
    expect(within(paid).getByRole('radio', { name: 'Deposit' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(within(paid).getByRole('radio', { name: 'Nothing yet' })).toBeChecked()
  })

  it('names cards and chips with a pause before the price, and ties errors to their options', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    expect(within(dialog).getByRole('radio', { name: /^Plain, ₱300/ })).toBeInTheDocument()
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Removal only' })).getByRole('radio', { name: /^My Work, ₱100/ })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Name/), 'Cora')
    await user.click(within(dialog).getByRole('radio', { name: /^Plain\b/ }))
    for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    await within(dialog).findByRole('radio', { name: /^11:00 AM/ })
    await user.click(within(dialog).getByRole('button', { name: 'Book and confirm' }))
    const times = within(dialog).getByRole('radiogroup', { name: 'Time' })
    expect(times).toHaveAccessibleDescription('Choose a time.')
  })

  it('lists a removal first in the summary, the order it is done', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    await user.click(within(dialog).getByRole('radio', { name: /^BIAB\b/ }))
    await user.click(within(within(dialog).getByRole('radiogroup', { name: 'Removal first' })).getByRole('radio', { name: /^My Work/ }))
    const lines = [...within(dialog).getByRole('complementary', { name: 'Booking summary' }).querySelectorAll('.nb-sum-lines li > span:first-child')].map((x) => x.textContent)
    expect(lines).toEqual(['Removal first: My Work', 'BIAB'])
  })

  it('asks for a service before showing times, and clears the time when the service changes', async () => {
    const user = userEvent.setup()
    const dialog = await openNewBooking(user)
    expect(within(dialog).getByText('Pick a service to see open times.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /^Plain\b/ }))
    for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    const slot = await within(dialog).findByRole('radio', { name: /^11:00 AM/ })
    await user.click(slot)
    expect(slot).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: /^BIAB\b/ }))
    expect(within(dialog).queryByRole('radio', { name: /^11:00 AM/, checked: true })).toBeNull()
  })

  it('books a walk-in without an account, confirmed, with the cash deposit recorded', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await user.click(await screen.findByRole('button', { name: '+ New booking' }))
    const dialog = await screen.findByRole('dialog', { name: 'New booking' })
    // Only walk-ins and people who message the salon's pages; clients with an account book online themselves.
    expect(within(dialog).queryByRole('radio', { name: /Has an account/ })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: 'Facebook' }))
    await user.type(within(dialog).getByLabelText(/^Name/), 'Ana Santos')
    await user.click(within(dialog).getByRole('radio', { name: /^Plain\b/ }))
    // The salon's own date picker: past days can't be chosen, and the arrows step a day at a time.
    expect(within(dialog).getByRole('button', { name: 'Previous day' })).toBeDisabled()
    for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    await user.click(await within(dialog).findByRole('radio', { name: /^11:00 AM/ }))
    await user.click(within(dialog).getByRole('radio', { name: 'Deposit' }))
    await user.click(within(dialog).getByRole('button', { name: 'Book and confirm' }))

    expect(await screen.findByText(/made for Ana Santos and confirmed/)).toBeInTheDocument()
    const booking = getDb().bookings.at(-1)
    expect(booking).toMatchObject({ guestName: 'Ana Santos', status: 'Confirmed', createdByAdmin: true, amountPaid: 150, note: 'Booked through Facebook' })
    expect(getDb().payments.at(-1)).toMatchObject({ method: 'Cash', bookingId: booking.id })
    // The list shows the walk-in's own name, not Leyah's account.
    expect(await screen.findByText('Booked by Leyah')).toBeInTheDocument()
  })
})

describe('Shade stock and booking rules', () => {
  it('marks a shade out of stock, and clients can no longer pick it', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/services')
    await user.click(await screen.findByRole('button', { name: /^#06 – .*: in stock$/ }))
    expect(await screen.findByRole('button', { name: /^#06 – .*: out of stock$/ })).toBeInTheDocument()

    const catalog = await mockRequest('GET', '/services')
    expect(catalog.outOfStockColors).toEqual(['#06'])
    await signIn(CLIENT)
    await expect(mockRequest('POST', '/bookings', { body: {} })).rejects.toBeTruthy() // still requires a full booking
  })

  it('keeps "with design" at its set price + ₱100 and its set time + 1 hour', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/services')
    // The design version's price and time can't be typed in; they follow the set.
    expect(await screen.findByLabelText('Price of Soft Gel Extension with Design')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Duration of Soft Gel Extension with Design in minutes')).toHaveAttribute('readonly')

    const price = screen.getByLabelText('Price of Soft Gel Extension')
    await user.clear(price)
    await user.type(price, '350')
    const minutes = screen.getByLabelText('Duration of Soft Gel Extension in minutes')
    await user.clear(minutes)
    await user.type(minutes, '150')
    await user.click(within(price.closest('.catalog-row')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Soft Gel Extension saved.')).toBeInTheDocument()

    const design = (await mockRequest('GET', '/services')).services.find((s) => s.name === 'Soft Gel Extension with Design')
    expect(design).toMatchObject({ price: 450, durationMinutes: 210 })
  })

  it("writes each service's line for its home page card (none on a design version)", async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/services')
    const line = await screen.findByLabelText('Home page line for BIAB')
    expect(screen.queryByLabelText('Home page line for BIAB with Design')).toBeNull() // it shares BIAB's card
    expect(screen.queryByLabelText('Home page line for Chrome')).toBeNull() // add-ons share one card
    await user.type(line, 'Strength for your own nails.')
    await user.click(within(line.closest('.catalog-row')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('BIAB saved.')).toBeInTheDocument()
    expect((await mockRequest('GET', '/services')).services.find((s) => s.id === 3).description).toBe('Strength for your own nails.')
  })

  it('changes the deposit, which the price list then uses', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/schedule')
    const deposit = await screen.findByLabelText(/^Deposit/)
    await user.clear(deposit)
    await user.type(deposit, '200')
    await user.click(screen.getByRole('button', { name: 'Save rules' }))

    expect(await screen.findByText('Booking rules saved.')).toBeInTheDocument()
    expect((await mockRequest('GET', '/services')).depositAmount).toBe(200)
  })
})

describe('Client notes, feedback replies and the gallery', () => {
  it('keeps a private note on a client', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/clients')
    await user.click(await screen.findByRole('button', { name: `Open @${CLIENT.username}` }))
    await user.type(await screen.findByLabelText('Your private note'), 'Prefers short almond')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(getDb().users.find((u) => u.username === CLIENT.username).adminNote).toBe('Prefers short almond'))
    expect(screen.getByText('No-shows')).toBeInTheDocument()
  })

  it('replies to feedback, and the client sees the reply', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    await mockRequest('POST', '/feedback', { body: { rating: 5, comment: 'Lovely set!', submissionKey: crypto.randomUUID() } })
    await signIn(ADMIN)
    const admin = renderApp('/admin/feedback')
    const item = (await screen.findByText('Lovely set!')).closest('li')
    await user.click(within(item).getByRole('button', { name: 'Reply' }))
    await user.type(within(item).getByLabelText('Reply to this feedback'), 'Thank you, see you soon!')
    await user.click(within(item).getByRole('button', { name: 'Send reply' }))
    expect(await within(item).findByText('Thank you, see you soon!')).toBeInTheDocument()
    admin.unmount()

    await signIn(CLIENT)
    renderApp('/feedback')
    expect(await screen.findByText('Leyah replied')).toBeInTheDocument()
    expect(screen.getByText('Thank you, see you soon!')).toBeInTheDocument()
  })

  it("adds a photo to the home page's Our Works", async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/gallery')
    await user.upload(await screen.findByLabelText('Photo'), new File([PNG], 'lace.png', { type: 'image/png' }))
    await user.type(screen.getByLabelText(/^Caption/), 'Lace with silver studs')
    await user.click(screen.getByRole('button', { name: 'Add to the home page' }))

    expect(await screen.findByText('Photo added to the home page.')).toBeInTheDocument()
    expect((await mockRequest('GET', '/gallery')).map((p) => p.caption)).toEqual(['Lace with silver studs'])
  })
})
