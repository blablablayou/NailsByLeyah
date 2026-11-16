import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

const OLD_LOGO = 'img[src*="/img/logo"]' // the old bow-and-script picture (logo.webp, logo.png, logo-header.webp)

describe('The current logo everywhere', () => {
  it('the opening animation writes the current "Nails by Leyah · Nail Studio" wordmark', () => {
    sessionStorage.removeItem('nbl-intro-seen')
    const { container } = renderApp('/')
    const intro = container.querySelector('.hm-intro')
    expect(intro.querySelector('svg.brand-logo')).not.toBeNull()
    expect(intro.querySelector(OLD_LOGO)).toBeNull()
  })

  it('the full price list carries the current wordmark too', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const pricing = screen.getByRole('region', { name: 'Services & Pricing' })
    await within(pricing).findAllByRole('article')
    await user.click(within(pricing).getByRole('button', { name: 'View full price list' }))

    const card = within(screen.getByRole('dialog', { name: 'Full price list' })).getByRole('article', { name: 'Nails price list' })
    expect(within(card).getByRole('img', { name: 'Nails by Leyah' }).tagName.toLowerCase()).toBe('svg')
    expect(card.querySelector(OLD_LOGO)).toBeNull()
  })
})
