import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { AdminNav, ClientAccountMenu } from './AdminNav'
import { ErrorBoundary } from './ErrorBoundary'
import { useAuth } from '../auth/AuthContext'
import { Alert } from './ui'
import { SocialLinks } from './SocialLinks'
import { BrandLogo } from './BrandLogo'
import { LegalDocumentModal } from './Modal'
import { salon } from '../content/salon'
import { formatPhone, useSalon } from './SalonProfile'
import { apiPhotoSrc } from '../lib/photos'
import { api } from '../api'
import { useAsync } from '../hooks/useAsync'

const YEAR = new Date().getFullYear()

// "Rate us" appears once the client has had a successful (completed) visit.
const clientLinks = (canRate) => [
  { to: '/book', label: 'Book now' },
  { to: '/bookings', label: 'My bookings' },
  ...(canRate ? [{ to: '/feedback', label: 'Rate us' }] : []),
]

export function Layout() {
  const { user, logout } = useAuth()
  const { phone } = useSalon()
  const [legalDocument, setLegalDocument] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  // Both are tied to the current location, so navigating closes the mobile menu and
  // the guard's "access denied" message shows once per redirect.
  const [menuOpenAt, setMenuOpenAt] = useState(null)
  const [dismissedAt, setDismissedAt] = useState(null)
  const menuOpen = menuOpenAt === location.key
  const setMenuOpen = (update) => setMenuOpenAt((update(menuOpen) ? location.key : null))
  const accessDenied = Boolean(location.state?.accessDenied) && dismissedAt !== location.key
  const setAccessDenied = () => setDismissedAt(location.key)

  const isAdmin = user?.role === 'Administrator'
  const isHome = location.pathname === '/'
  // Checked again when the client signs in or moves between their own pages, so a visit Leyah just completed shows up.
  const isClientPage = ['/book', '/bookings', '/feedback', '/profile'].includes(location.pathname)
  const visits = useAsync(() => (user?.role === 'Client' ? api.bookings.history().catch(() => []) : Promise.resolve([])),
    [user?.id, user?.role, isClientPage && location.pathname])
  const canRate = (visits.data ?? []).some((b) => b.status === 'Completed')
  const links = user ? clientLinks(canRate) : []
  // Left of the centred logo: booking first, then the two landing sections (HomePage glides to the hash).
  // Guests are sent to sign up when they book, as the hero's button does.
  const bookLink = user ? links[0] : { to: '/register', label: 'Book now' }
  const homeLinks = [{ to: '/#services', label: 'Services' }, { to: '/#gallery', label: 'Gallery' }]

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className={isAdmin ? 'header-inner header-admin' : 'header-inner header-split'}>
          <Link to={isAdmin ? '/admin' : '/'} className="brand">
            <BrandLogo />
          </Link>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="site-nav"
            onClick={() => setMenuOpen((open) => !open)}>
            <span className="sr-only">Menu</span>
            <span className="menu-bars" aria-hidden="true" />
          </button>
          {isAdmin ? (
            <AdminNav user={user} onSignOut={signOut} menuOpen={menuOpen} />
          ) : (
            // Wide screens: these two groups sit either side of the centred logo; phones show them stacked in the menu.
            <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main">
              <div className="nav-side nav-side-start">
                <NavLink to={bookLink.to} className="nav-link">{bookLink.label}</NavLink>
                {homeLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="nav-link">{link.label}</Link>
                ))}
              </div>
              <div className="nav-side nav-side-end">
                {/* About goes to Meet Leyah (built in Phase 5 of the landing page plan). */}
                <Link to="/#about" className="nav-link">About</Link>
                <Link to="/#visit" className="nav-link">Contact</Link>
                {links.slice(1).map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
                    {link.label}
                  </NavLink>
                ))}
                {user ? (
                  <ClientAccountMenu user={user} photo={apiPhotoSrc(user.photoUrl, user.photoDataUrl)} onSignOut={signOut} />
                ) : (
                  // Sign in is the header's call to action. Signing up is reached through Book now, the hero's button and
                  // "Create an account" on the sign-in page.
                  <NavLink to="/login" className="nav-link nav-cta">Sign in</NavLink>
                )}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main id="main" className={isHome ? 'page page-home' : 'page'}>
        {accessDenied && (
          <Alert kind="warning" onClose={setAccessDenied}>
            You don&apos;t have access to that page, so we brought you here instead.
          </Alert>
        )}
        {/* Keyed by page, so moving to another page clears the error. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="site-footer">
        {/* One slim row: copyright, legal links, social icons (no logo here: the header already shows it). */}
        <div className="footer-inner">
          <p className="footer-copy">
            © {YEAR} {salon.name}
            {phone && <> · <a className="footer-phone" href={`tel:${phone}`}>Call or text {formatPhone(phone)}</a></>}
          </p>
          <nav className="footer-links" aria-label="Footer">
            <button type="button" onClick={() => setLegalDocument('terms')}>Terms &amp; Conditions</button>
            <span aria-hidden="true">•</span>
            <button type="button" onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>
          </nav>
          <SocialLinks variant="plain" className="footer-social" />
        </div>
      </footer>
      {legalDocument && <LegalDocumentModal document={legalDocument} onClose={() => setLegalDocument(null)} />}
    </div>
  )
}
