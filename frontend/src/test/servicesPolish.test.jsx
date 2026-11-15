import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { mockRequest } from './mockBackend/mockApi'

const openServices = async () => {
  await signIn(ADMIN)
  renderApp('/admin/services')
  return screen.findByRole('heading', { name: 'Services & prices' })
}
const rowOf = (name) => screen.getByDisplayValue(name).closest('.catalog-row')

describe('Services & prices polish', () => {
  it('1: the home page line is folded until Leyah edits it; the count shows while typing', async () => {
    const user = userEvent.setup()
    await openServices()
    const row = rowOf('BIAB')
    expect(within(row).queryByLabelText('Home page line for BIAB')).toBeNull()
    expect(within(row).getByText(/Home page line: website's own line/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Edit home page line for BIAB' }))
    const line = within(row).getByLabelText('Home page line for BIAB')
    expect(within(row).queryByText(/\/160/)).toBeNull()
    await user.type(line, 'Strong')
    expect(within(row).getByText(/6\/160/)).toBeInTheDocument()
  })

  it('2: Save and Undo appear only when something changed; Undo puts it back', async () => {
    const user = userEvent.setup()
    await openServices()
    const row = rowOf('Plain')
    expect(within(row).queryByRole('button', { name: 'Save' })).toBeNull()

    const price = within(row).getByLabelText('Price of Plain')
    await user.clear(price)
    await user.type(price, '320')
    expect(within(row).getByRole('button', { name: 'Save' })).toBeEnabled()
    await user.click(within(row).getByRole('button', { name: 'Undo changes to Plain' }))

    expect(price).toHaveValue(300)
    expect(within(row).queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it("3: Remove asks in the site's own dialog", async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    await openServices()
    await user.click(within(rowOf('Chrome')).getByRole('button', { name: 'Remove Chrome' }))

    const dialog = screen.getByRole('dialog', { name: 'Remove Chrome?' })
    expect(dialog).toHaveTextContent('Past bookings are not affected.')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Chrome removed.')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('4: a "with design" row shows its worked-out price and length as text, tagged', async () => {
    await openServices()
    const row = rowOf('Soft Gel Extension with Design')
    expect(within(row).queryByLabelText('Price of Soft Gel Extension with Design')).toBeNull()
    expect(within(row).getByText('With design')).toHaveClass('catalog-tag')
    expect(within(row).getByText('₱499.00')).toBeInTheDocument()
    expect(within(row).getByText((_, el) => el?.classList.contains('catalog-was') && el.textContent === 'Soft Gel Extension + ₱100.00')).toBeInTheDocument()
    expect(within(row).getByText('180 min')).toBeInTheDocument()
    expect(within(row).getByText('+1 hr')).toBeInTheDocument()
  })

  it('5: counts unsaved changes and asks before leaving for another page', async () => {
    const user = userEvent.setup()
    await openServices()
    const plain = within(rowOf('Plain')).getByLabelText('Price of Plain')
    await user.type(plain, '0')
    const biab = within(rowOf('BIAB')).getByLabelText('Price of BIAB')
    await user.type(biab, '0')
    expect(screen.getByRole('status', { name: 'Unsaved changes' })).toHaveTextContent('2 unsaved changes')

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    const ask = screen.getByRole('dialog', { name: 'Leave without saving?' })
    await user.click(within(ask).getByRole('button', { name: 'Stay on this page' }))
    expect(screen.getByRole('heading', { name: 'Services & prices' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Services & prices' })).toBeNull())
    expect((await mockRequest('GET', '/services')).services.find((s) => s.name === 'Plain').price).toBe(300) // nothing saved
  })
})
