import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { api } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { policies, schedule } from '../../content/salon'
import { formatHours } from '../../lib/format'
import { Intro } from './home/Intro'
import { Hero } from './home/Hero'
import { PhotoViewer, usePhotoViewer, WorksGallery } from './home/WorksGallery'
import { PricingSection } from './home/PricingSection'
import { FaqSection, RulesSection } from './home/RulesAndFaq'
import { Location } from './home/InfoCards'
import { MeetLeyah } from './home/MeetLeyah'
import { canAnimate, peso, planIntro, scrollToSection } from './home/motion'
import '../../styles/home.css'

export { Location } from './home/InfoCards'

// Header links that light up while their section is on screen (see Layout): Services, Gallery, About, Contact.
const SPY_SECTIONS = ['services', 'gallery', 'about', 'visit']

/**
 * Landing page, in the order agreed for the redesign (docs/superpowers/plans/2026-11-14-landing-page-redesign.md):
 * the opening animation, Hero, Services & Pricing, Our Works, (Meet Leyah, Phase 5), Nail Rules, FAQ, Visit Us.
 */
export default function HomePage() {
  const { user } = useAuth()
  const location = useLocation()
  const rootRef = useRef(null)
  const toTopRef = useRef(null)
  const [intro] = useState(planIntro)
  const catalog = useAsync(() => api.catalog.get(), [])
  const deposit = peso(catalog.data?.depositAmount ?? policies.depositAmount)
  // Opening hours from the API: the closing time is set by Leyah on the admin Schedule page.
  const salonHours = useAsync(() => api.catalog.hours(), [])
  const hours = formatHours(salonHours.data ?? { openingTime: schedule.openingTime, closingTime: schedule.defaultClosingTime })
  const bookTo = user ? '/book' : '/register'
  // Shown once, after sign-up and email verification.
  const navigate = useNavigate()
  const welcome = location.state?.welcome === 'verified'
  const dismissWelcome = () => navigate(location.pathname + location.hash, { replace: true, state: null })

  // Photo viewer (Our Works photos); focus goes back to whatever opened it.
  const { open: viewerOpen, photo: viewerPhoto, openPhoto, closePhoto } = usePhotoViewer()


  // Header links (/#services, /#gallery) and links from other pages land here with a hash: glide to that section.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (id) scrollToSection(id)
  }, [location.key, location.hash])

  useEffect(() => {
    const root = rootRef.current
    const reveals = root.querySelectorAll('.hm-reveal')
    if (!canAnimate) { reveals.forEach((el) => { el.dataset.in = '' }); return undefined }

    // Cards fade in as they scroll into view.
    const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.dataset.in = ''; revealer.unobserve(e.target) }
    }), { threshold: 0.15 })
    reveals.forEach((el) => revealer.observe(el))

    // The header link for the section crossing the middle of the screen is highlighted.
    const html = document.documentElement
    const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) html.dataset.homeSection = e.target.id
      else if (html.dataset.homeSection === e.target.id) delete html.dataset.homeSection
    }), { rootMargin: '-50% 0px -50% 0px' })
    SPY_SECTIONS.map((id) => document.getElementById(id)).filter(Boolean).forEach((section) => spy.observe(section))

    // Back-to-top shows once the hero is off screen.
    const hero = new IntersectionObserver(([e]) => toTopRef.current?.classList.toggle('show', !e.isIntersecting))
    hero.observe(document.getElementById('hero'))

    return () => { revealer.disconnect(); spy.disconnect(); hero.disconnect(); delete html.dataset.homeSection }
  }, [])

  return (
    <div className="home" ref={rootRef}>
      {welcome && (
        <div className="hm-welcome" role="status">
          <span className="hm-welcome-check" aria-hidden="true">✓</span>
          <p><strong>Your account is ready!</strong> Your email is verified. Log in to book your first appointment.</p>
          {!user && <Link to="/login" className="btn btn-primary btn-sm">Log in</Link>}
          <button type="button" className="hm-welcome-close" onClick={dismissWelcome} aria-label="Dismiss">×</button>
        </div>
      )}
      <Intro plan={intro} />
      <Hero bookTo={bookTo} revealAfter={intro.play ? intro.lettersDone + 500 : 0} />
      <PricingSection catalog={catalog} bookTo={bookTo} />
      <WorksGallery onOpen={openPhoto} />
      <MeetLeyah />
      <RulesSection deposit={deposit} />
      <FaqSection deposit={deposit} hours={hours} />
      <section className="hm-find hm-section" id="visit" tabIndex={-1} aria-labelledby="find-us-title">
        <Location hours={hours} />
      </section>
      <PhotoViewer photo={viewerPhoto} open={viewerOpen} onClose={closePhoto} />
      <button type="button" className="hm-to-top" ref={toTopRef} aria-label="Back to top" onClick={() => scrollToSection('hero')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}
