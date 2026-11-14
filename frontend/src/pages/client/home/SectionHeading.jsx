/**
 * The heading every landing page section opens with: the title, and an optional line under it, centred. It fades in
 * once as it scrolls into view (`.hm-reveal`, handled by HomePage); with reduced motion, or no motion support, it is
 * simply there.
 *
 * `eyebrow` (a small label above the title, as in the reference designs) is optional and unused for now: whether the
 * page uses one is still to be decided (see the landing page plan).
 */
export function SectionHeading({ id, title, intro, introClassName, eyebrow }) {
  return (
    <div className="hm-head hm-reveal">
      {eyebrow && <p className="hm-eyebrow">{eyebrow}</p>}
      <h2 id={id}>{title}</h2>
      {intro && <p className={introClassName}>{intro}</p>}
    </div>
  )
}
