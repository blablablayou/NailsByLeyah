import { useSalon } from '../../../components/SalonProfile'
import { aboutHighlights, ownerQuote, sampleStory } from '../../../content/salon'

/** Leah's bio as paragraphs: a blank line starts a new one. */
const paragraphs = (bio) => bio.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

/** Leyah's photo (1000 × 1500); it fills the panel, framed on her face and upper body. */
const PORTRAIT = { src: '/img/leyah.webp', width: 1000, height: 1500 }

const ICONS = {
  polish: <><path d="M10 3h4v4h-4z" /><path d="M8.5 7h7l1 3v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-9z" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  sparkle: <><path d="M11 3l1.7 4.8 4.8 1.7-4.8 1.7L11 16l-1.7-4.8-4.8-1.7 4.8-1.7z" /><path d="M18 15l.7 1.8 1.8.7-1.8.7L18 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
}

const Icon = ({ name, size = 26 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
)

/**
 * Meet Leyah (Phase 5, decision D9), laid out like the reference: an "About the owner" pill, a big italic title with a
 * heart and a brush underline, her story, three highlights with icons, and her goal as a quote; her photo on
 * the right, filling its panel (stacked under the card on phones). The story is the Bio on her salon profile (admin → Salon settings);
 * until she writes one, the brief's sample shows, labelled as a sample.
 * To change the photo, replace public/img/leyah.webp (same name).
 */
export function MeetLeyah() {
  const { bio } = useSalon()
  const story = bio?.trim() ? paragraphs(bio) : null

  return (
    <section className="hm-about hm-section" id="about" tabIndex={-1} aria-labelledby="about-title">
      <div className="hm-about-inner">
        <div className="hm-about-card hm-reveal">
          {/* The one section label kept (the reference asks for it here; D12 leaves them out elsewhere). */}
          <p className="hm-about-pill"><span>About the owner</span></p>
          <h2 id="about-title" className="hm-about-title">
            <span className="hm-about-name">Meet Leyah</span>
            <svg className="hm-about-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
            </svg>
          </h2>
          <svg className="hm-about-stroke" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 9c60-6 150-8 292-3" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          </svg>
          {!story && <p className="hm-about-sample">Sample story · details to be confirmed</p>}
          <div className="hm-about-story">
            {(story ?? sampleStory).map((text) => <p key={text}>{text}</p>)}
          </div>
          <ul className="hm-about-highlights">
            {aboutHighlights.map((h) => (
              <li key={h.label}><span className="hm-about-icon"><Icon name={h.icon} /></span><span>{h.label}</span></li>
            ))}
          </ul>
          <blockquote className="hm-about-quote">
            <p>{ownerQuote} <span aria-hidden="true">♡</span></p>
          </blockquote>
        </div>
        <div className="hm-about-photo hm-reveal" style={{ '--i': 1 }}>
          <img src={PORTRAIT.src} alt="Leyah, owner of Nails by Leyah" width={PORTRAIT.width} height={PORTRAIT.height}
            loading="lazy" decoding="async" />
        </div>
      </div>
    </section>
  )
}
