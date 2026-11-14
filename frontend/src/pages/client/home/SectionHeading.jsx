/**
 * The heading every landing page section opens with: the title, and an optional line under it, centred. No small
 * label above the title (decision D12). It fades in once as it scrolls into view (`.hm-reveal`, handled by
 * HomePage); with reduced motion, or no motion support, it is simply there.
 */
export function SectionHeading({ id, title, intro, introClassName }) {
  return (
    <div className="hm-head hm-reveal">
      <h2 id={id}>{title}</h2>
      {intro && <p className={introClassName}>{intro}</p>}
    </div>
  )
}
