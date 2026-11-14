import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api'
import { mockRequest } from './mockBackend/mockApi'
import { getDb, saveDb } from './mockBackend/db'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('Home page', () => {
  it('shows every section', () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Beautiful Nails, Beautiful You.' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Up close' })).toBeNull() // replaced by the gallery (D2)
    expect(screen.getByRole('heading', { name: 'Services & Pricing' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Our Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nail Rules' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Find Nails by Leyah' })).toBeInTheDocument()
  })

  describe('Services & Pricing', () => {
    const cardsIn = async () => {
      const section = screen.getByRole('region', { name: 'Services & Pricing' })
      await within(section).findAllByRole('article')
      return section
    }
    const card = (section, name) => within(section).getByRole('article', { name })

    it('shows five service cards: Plain, BIAB, Soft Gel Extension, Nail Design Add-ons, Removal', async () => {
      renderApp('/')
      const section = await cardsIn()
      expect(section).toHaveTextContent('Final pricing depends on your service, design and add-ons.')
      const names = within(section).getAllByRole('article').map((a) => within(a).getByRole('heading').textContent)
      expect(names).toEqual(['Plain', 'BIAB', 'Soft Gel Extension', 'Nail Design Add-ons', 'Removal'])
      expect(within(section).getByRole('link', { name: 'Book now' })).toHaveAttribute('href', '/register')
      expect(within(section).getByRole('button', { name: 'View full price list' })).toBeInTheDocument()
    })

    it('takes every price from the live price list', async () => {
      renderApp('/')
      const section = await cardsIn()
      expect(card(section, 'Plain')).toHaveTextContent('₱300')
      expect(card(section, 'Plain')).toHaveTextContent('Plain colour only')
      expect(card(section, 'BIAB')).toHaveTextContent('₱250')
      expect(card(section, 'BIAB')).toHaveTextContent('With design · ₱350')
      expect(card(section, 'Soft Gel Extension')).toHaveTextContent('₱399')
      expect(card(section, 'Soft Gel Extension')).toHaveTextContent('With design · ₱499')
      expect(card(section, 'Nail Design Add-ons')).toHaveTextContent('From₱10/ nail')
      expect(card(section, 'Removal')).toHaveTextContent('My work · ₱100')
      expect(card(section, 'Removal')).toHaveTextContent('Not my work · ₱150')
    })

    it('shows how long each set takes', async () => {
      renderApp('/')
      const section = await cardsIn()
      expect(card(section, 'Plain')).toHaveTextContent('2 hr')
      expect(card(section, 'BIAB')).toHaveTextContent('3 hr')
      expect(card(section, 'Soft Gel Extension')).toHaveTextContent('2 hr')
      expect(card(section, 'Nail Design Add-ons')).not.toHaveTextContent(/\d hr/)
    })

    it("shows the line Leah wrote in admin, or the website's own line until she writes one", async () => {
      await signIn(ADMIN)
      await mockRequest('PUT', '/admin/services/3', { body: { name: 'BIAB', price: 250, isActive: true, description: 'Strength for your own nails.' } })
      await mockRequest('POST', '/auth/logout')
      renderApp('/')
      const section = await cardsIn()
      expect(card(section, 'BIAB')).toHaveTextContent('Strength for your own nails.')
      expect(card(section, 'Plain')).toHaveTextContent('A clean, glossy soft gel in one colour.')
    })

    it('drops a service that Leah turned off', async () => {
      await signIn(ADMIN)
      await mockRequest('PUT', '/admin/services/7', { body: { name: 'Soft Gel Extension', price: 399, isActive: false } })
      await mockRequest('POST', '/auth/logout')
      renderApp('/')
      const section = await cardsIn()
      expect(within(section).getAllByRole('article')).toHaveLength(4)
      expect(within(section).queryByRole('article', { name: 'Soft Gel Extension' })).toBeNull()
    })

    it('still shows the cards when the price list fails to load', async () => {
      vi.spyOn(api.catalog, 'get').mockRejectedValue(Object.assign(new Error('Network down'), { status: 0 }))
      renderApp('/')
      const section = await cardsIn()
      const cards = within(section).getAllByRole('article')
      expect(cards).toHaveLength(5)
      cards.forEach((c) => expect(c).toHaveTextContent('See prices when booking'))
      expect(section).not.toHaveTextContent('₱0')
      expect(within(section).queryByRole('button', { name: 'View full price list' })).toBeNull()
      vi.restoreAllMocks()
    })
  })

  it('unfolds the full price list from the live prices, with the design versions and Rhinestone', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const pricing = screen.getByRole('region', { name: 'Services & Pricing' })
    await within(pricing).findAllByRole('article')
    await user.click(within(pricing).getByRole('button', { name: 'View full price list' }))

    const card = within(pricing).getByRole('article', { name: 'Nails price list' })
    const row = (name) => within(card).getByText(name).closest('.pc-row')
    expect(row('Soft Gel Extension')).toHaveTextContent('₱399')
    expect(row('Soft Gel Extension with design')).toHaveTextContent('+₱100') // what the design adds, not the total
    expect(within(card).queryByText('Plain with design')).toBeNull() // Plain takes no design
    expect(row('BIAB with design')).toHaveTextContent('+₱100')
    expect(row('Rhinestone')).toHaveTextContent('₱15')
  })

  it('hero: headline, text and Book an Appointment on the left, the photo panel on the right', async () => {
    const { container } = renderApp('/')
    const hero = container.querySelector('#hero')
    expect(within(hero).getByRole('heading', { level: 1, name: 'Beautiful Nails, Beautiful You.' })).toBeInTheDocument()
    expect(hero).toHaveTextContent('Discover personalized nail care and elegant nail designs at NailsByLeyah.')
    expect(within(hero).getByRole('link', { name: 'Book an Appointment' })).toHaveAttribute('href', '/register')
    expect(hero.querySelector('.hm-eyebrow')).toBeNull() // no label above the title (D12)
    // The reference artwork (bottle, splash, hand), until Leah's photo (D4); decoration for screen readers.
    expect(hero.querySelector('.hm-hero-art')).toHaveAttribute('aria-hidden', 'true')
    expect(hero.querySelector('.hm-float')).toBeNull() // the floating photo cards are gone
  })

  it('hero button takes a signed-in client to booking', async () => {
    await signIn(CLIENT)
    const { container } = renderApp('/')
    const hero = container.querySelector('#hero')
    expect(await within(hero).findByRole('link', { name: 'Book an Appointment' })).toHaveAttribute('href', '/book')
  })

  it('shows the sections in the agreed order, after the opening animation', () => {
    sessionStorage.removeItem('nbl-intro-seen')
    const { container } = renderApp('/')
    expect(container.querySelector('.hm-intro')).not.toBeNull() // the opening animation stays (D2, D11)
    const ids = [...container.querySelectorAll('.home > section[id]')].map((s) => s.id)
    expect(ids).toEqual(['hero', 'services', 'gallery', 'about', 'rules', 'faq', 'visit'])
  })

  it('sends guests to sign up when they book, and the header links go to Services and Gallery', () => {
    renderApp('/')
    expect(screen.getByRole('link', { name: 'Book an Appointment' })).toHaveAttribute('href', '/register')
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

  it("keeps a signed-in client's right side as short as a guest's: My bookings sits in the account menu", async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const account = await within(nav).findByRole('button', { name: /^Account:/ })
    const end = nav.querySelector('.nav-side-end')
    expect([...end.children].map((el) => el.textContent)).toEqual(['About', 'Contact', expect.stringContaining('Account:')])

    await user.click(account)
    expect(within(nav).getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings')
    expect(within(nav).getByRole('link', { name: 'My profile' })).toBeInTheDocument()
    await user.click(within(nav).getByRole('link', { name: 'My bookings' }))
    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
  })

  describe('Meet Leyah', () => {
    const setSalon = (values) => { Object.assign(getDb().salonSettings, values); saveDb() }

    it("shows Leah's own story when her profile has one, a paragraph per blank line", async () => {
      setSalon({ bio: 'I do soft gel and BIAB.\n\nCome say hi.' })
      renderApp('/')
      const about = screen.getByRole('region', { name: 'Meet Leyah' })
      expect(await within(about).findByText('I do soft gel and BIAB.')).toBeInTheDocument()
      expect(within(about).getByText('Come say hi.').tagName).toBe('P')
      expect(within(about).queryByText(/Sample story/)).toBeNull()
      expect(about).not.toHaveTextContent("Hi, I'm Leyah")
    })

    it('has the reference layout: the pill, three highlights and her goal as a quote', () => {
      renderApp('/')
      const about = screen.getByRole('region', { name: 'Meet Leyah' })
      expect(within(about).getByText('About the owner')).toBeInTheDocument()
      expect(within(about).getByRole('heading', { level: 2, name: 'Meet Leyah' })).toBeInTheDocument()
      const highlights = within(about).getAllByRole('listitem').map((li) => li.textContent)
      expect(highlights).toEqual(['Personalized Nail Designs', 'Quality & Care', 'A Relaxing Experience'])
      expect(about.querySelector('blockquote')).toHaveTextContent('My goal is to make every client feel confident, pampered, and beautiful')
    })

    it('shows the labelled sample story until Leah writes hers, with no unconfirmed year', () => {
      renderApp('/')
      const about = screen.getByRole('region', { name: 'Meet Leyah' })
      expect(within(about).getByText('Sample story · details to be confirmed')).toBeInTheDocument()
      expect(about).toHaveTextContent("Hi, I'm Leyah!")
      expect(about.textContent).not.toMatch(/20\d\d/)
    })

    it('shows her cut-out portrait', () => {
      renderApp('/')
      const about = screen.getByRole('region', { name: 'Meet Leyah' })
      expect(within(about).getByRole('img', { name: 'Leyah, owner of Nails by Leyah' })).toHaveAttribute('src', '/img/leyah.webp')
    })

    it("is where the header's About link goes, between the gallery and the rules", () => {
      const { container } = renderApp('/')
      const ids = [...container.querySelectorAll('.home > section[id]')].map((s) => s.id)
      expect(ids).toEqual(['hero', 'services', 'gallery', 'about', 'rules', 'faq', 'visit'])
      expect(container.querySelector('.visit-meet')).toBeNull() // the small card under Visit Us is gone
    })
  })

  describe('Our Works', () => {
    const tiles = (root) => within(root).getAllByRole('button', { name: /^View / })
    const addUploads = (...captions) => {
      const db = getDb()
      db.galleryPhotos = captions.map((caption, i) => ({ id: 900 + i, caption, createdAt: `2026-11-1${i}T00:00:00Z`, dataUrl: TINY_PNG }))
      saveDb()
    }

    it('shows nine works and a link to the full gallery', () => {
      const { container } = renderApp('/')
      const gallery = container.querySelector('#gallery')
      expect(within(gallery).getByRole('heading', { name: 'Our Works' })).toBeInTheDocument()
      expect(gallery).toHaveTextContent('Soft gel, BIAB and nail art, crafted by Leyah.')
      expect(tiles(gallery)).toHaveLength(9)
      expect(within(gallery).getByRole('link', { name: /View full gallery/ })).toHaveAttribute('href', '/gallery')
    })

    it("puts Leah's newest uploads first and fills the rest from the built-in photos", async () => {
      addUploads('Older set', 'Newest set') // the newest is added last; the gallery lists it first
      const { container } = renderApp('/')
      const gallery = container.querySelector('#gallery')
      await within(gallery).findByRole('button', { name: 'View Newest set' })
      const names = tiles(gallery).map((b) => b.getAttribute('aria-label'))
      expect(names).toHaveLength(9)
      expect(names.slice(0, 3)).toEqual(['View Newest set', 'View Older set', 'View Nail set 1'])
    })

    it('opens a photo larger and closes it with Escape, back on the photo', async () => {
      const user = userEvent.setup()
      const { container } = renderApp('/')
      const first = tiles(container.querySelector('#gallery'))[0]
      await user.click(first)
      const viewer = screen.getByRole('dialog', { name: 'Nail set photo' })
      expect(viewer).toHaveClass('open')
      await user.keyboard('{Escape}')
      expect(viewer).not.toHaveClass('open')
      expect(first).toHaveFocus()
    })

    it('the full gallery page lists every photo', async () => {
      addUploads('Newest set')
      renderApp('/gallery')
      const page = await screen.findByRole('region', { name: 'Our Works' })
      await within(page).findByRole('button', { name: 'View Newest set' })
      expect(tiles(page)).toHaveLength(1 + 13) // the upload and every built-in photo
      expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/')
    })
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
