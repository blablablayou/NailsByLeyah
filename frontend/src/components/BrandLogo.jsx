import { salon } from '../content/salon'

/**
 * The header wordmark, drawn as text in an SVG: "Nails by Leyah" in a script face (Great Vibes, self-hosted) over
 * "NAIL STUDIO" in small spaced capitals, both in the brand burgundy (currentColor). Being text, it stays sharp at
 * any size and needs no image file; the whole mark is announced once by its label.
 */
export function BrandLogo({ className = 'brand-logo' }) {
  return (
    <svg className={className} viewBox="0 0 300 96" role="img" aria-label={salon.name}>
      <text x="150" y="54" textAnchor="middle" className="brand-logo-script">Nails by Leyah</text>
      <text x="150" y="86" textAnchor="middle" className="brand-logo-tag">Nail Studio</text>
    </svg>
  )
}
