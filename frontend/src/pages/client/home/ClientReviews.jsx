import { api } from '../../../api'
import { useAsync } from '../../../hooks/useAsync'
import { Stars } from '../../../components/StarRating'

/** "November 2026": when the client wrote it, without the exact day. */
const monthYear = (iso) => new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

/**
 * What clients say: the comments Leyah chose on the admin Feedback page (up to six, newest first), each with its stars,
 * the client's first name and last initial, and the month. Above them, the average of every rating, not only these.
 * The whole section stays away until Leyah has chosen one, or if it can't load. It arrives after the page has set up
 * its scroll reveals, so it doesn't use `.hm-reveal` (it would stay hidden).
 */
export function ClientReviews() {
  const home = useAsync(() => api.feedback.home().catch(() => null), [])
  const items = home.data?.items ?? []
  if (items.length === 0) return null
  const { averageRating, ratingCount } = home.data

  return (
    <section className="hm-reviews hm-section" id="reviews" tabIndex={-1} aria-labelledby="reviews-title">
      <div className="hm-head">
        <h2 id="reviews-title">What clients say</h2>
      </div>
      {averageRating != null && (
        <p className="hm-reviews-summary">
          <Stars rating={averageRating} size="md" />
          <span>{averageRating.toFixed(1)} from {ratingCount} rating{ratingCount === 1 ? '' : 's'}</span>
        </p>
      )}
      <ul className="hm-reviews-list">
        {items.map((f) => (
          <li key={f.id} className="hm-review">
            <Stars rating={f.rating} size="sm" />
            <blockquote><p>“{f.comment}”</p></blockquote>
            <p className="hm-review-by">
              <span className="hm-review-name">{f.name}</span>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              {monthYear(f.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
