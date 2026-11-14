import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { prefersReducedMotion } from './motion'

/**
 * Hero, laid out like the reference design: a white card with an open polish bottle pouring a pink "splash" across to a
 * raised hand, and the headline, a line about the salon and Book an Appointment over the white space on the left.
 *
 * The artwork is the reference design itself (public/img/hero-reference.webp), cropped below its header; three white
 * patches cover the reference's own text, exactly where it sits, so ours reads on clean white. It is temporary: the hand
 * is not Leah's work, and her own photo replaces it later (D4). Phones and tablets show the text first, then the hand
 * and splash on their own.
 *
 * The opening animation stays (D11): the copy appears, whole, once it ends (`revealAfter` ms), instead of typing.
 */
export function Hero({ bookTo, revealAfter = 0 }) {
  const [shown, setShown] = useState(() => revealAfter <= 0 || prefersReducedMotion())
  useEffect(() => {
    if (shown) return undefined
    const timer = setTimeout(() => setShown(true), revealAfter)
    return () => clearTimeout(timer)
  }, [shown, revealAfter])

  return (
    <section className="hm-hero hm-section" id="hero" tabIndex={-1} aria-labelledby="hero-title">
      <div className={shown ? 'hm-hero-card is-shown' : 'hm-hero-card'}>
        <span className="hm-hero-art" aria-hidden="true" />
        <div className="hm-hero-copy">
          {/* Two lines, one thought each; read as a single headline. */}
          <h1 id="hero-title"><span>Beautiful Nails,</span> <span>Beautiful You.</span></h1>
          <p className="hm-hero-lead">
            Discover personalized nail care and elegant nail designs at NailsByLeyah. From simple, classic manicures to
            creative nail art, every set is made with care.
          </p>
          <Link to={bookTo} className="hm-hero-cta">Book an Appointment</Link>
        </div>
      </div>
    </section>
  )
}
