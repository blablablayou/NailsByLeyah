import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

describe('Home page', () => {
  it('shows every section, with starting prices from the live price list', async () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Beautiful nails, booked in minutes.' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Up close' })).toBeNull() // replaced by the gallery (D2)
    expect(screen.getByRole('heading', { name: 'Our Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nail Rules' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Find Nails by Leyah' })).toBeInTheDocument()

    const pricing = screen.getByRole('region', { name: 'Pricing' })
    expect(await within(pricing).findByText('₱250+')).toBeInTheDocument() // BIAB is the cheapest soft gel
    expect(within(pricing).getByText('₱100+')).toBeInTheDocument()
    expect(within(pricing).getByText('₱10+')).toBeInTheDocument()
    // The sets as clients book them, with "With design" as the option on top.
    expect(within(pricing).getByText('Plain • Soft Gel Extension • BIAB • With design (optional)')).toBeInTheDocument()
  })

  it('unfolds the full price list from the live prices, with the design versions and Rhinestone', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const pricing = screen.getByRole('region', { name: 'Pricing' })
    await within(pricing).findByText('₱250+')
    await user.click(within(pricing).getByRole('button', { name: 'View full price list' }))

    const card = within(pricing).getByRole('article', { name: 'Nails price list' })
    const row = (name) => within(card).getByText(name).closest('.pc-row')
    expect(row('Soft Gel Extension')).toHaveTextContent('₱399')
    expect(row('Soft Gel Extension with design')).toHaveTextContent('+₱100') // what the design adds, not the total
    expect(within(card).queryByText('Plain with design')).toBeNull() // Plain takes no design
    expect(row('BIAB with design')).toHaveTextContent('+₱100')
    expect(row('Rhinestone')).toHaveTextContent('₱15')
  })

  it('shows the sections in the agreed order, after the opening animation', () => {
    sessionStorage.removeItem('nbl-intro-seen')
    const { container } = renderApp('/')
    expect(container.querySelector('.hm-intro')).not.toBeNull() // the opening animation stays (D2, D11)
    const ids = [...container.querySelectorAll('.home > section[id]')].map((s) => s.id)
    // Meet Leyah (about) joins between gallery and rules in Phase 5.
    expect(ids).toEqual(['hero', 'services', 'gallery', 'rules', 'faq', 'visit'])
  })

  it('sends guests to sign up when they book, and the header links go to Services and Gallery', () => {
    renderApp('/')
    expect(screen.getByRole('link', { name: 'Book an appointment' })).toHaveAttribute('href', '/register')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Book now' })).toHaveAttribute('href', '/register')
    expect(within(nav).getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/#services')
    expect(within(nav).getByRole('link', { name: 'Gallery' })).toHaveAttribute('href', '/#gallery')
    expect(within(nav).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/#visit')
    // Right of the logo: About, Contact, then Sign in (the call to action). Sign-up is reached through Book now and the hero.
    const right = [...nav.querySelector('.nav-side-end').querySelectorAll('a')].map((a) => a.textContent)
    expect(right).toEqual(['About', 'Contact', 'Sign in'])
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/#about')
    expect(within(nav).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(within(nav).getByRole('link', { name: 'Sign in' })).toHaveClass('nav-cta')
    expect(within(nav).queryByRole('link', { name: 'Sign up' })).toBeNull()
  })

  it('opens and closes FAQ answers', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const question = screen.getByRole('button', { name: 'Do you accept walk-ins?' })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })
})
