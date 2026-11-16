import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate } from '../../lib/format'
import { toIsoDate } from '../../lib/dates'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader, Pager, Spinner } from '../../components/ui'
import { LIMITS } from '../../validation/rules'
import { Stars } from '../../components/StarRating'

const PAGE_SIZE = 20
/** How many comments the home page shows at once (the backend's Feedback.MaxOnHome). */
const HOME_LIMIT = 6

/** Client ratings and comments, newest first, with the average and how the ratings are spread. */
export default function AdminFeedbackPage() {
  const [page, setPage] = useState(1)
  const list = useAsync(() => api.admin.feedback({ page, pageSize: PAGE_SIZE }), [page])
  // How many are on the home page right now, across every page of the list.
  const home = useAsync(() => api.feedback.home().catch(() => null), [])
  const shownOnHome = home.data?.items.length

  if (list.loading && !list.data) return <PageLoader label="Loading feedback…" />
  if (list.error) return <Alert kind="error">{errorMessage(list.error)}</Alert>

  const { items, totalCount, averageRating, countsByRating } = list.data
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const replace = (next) => list.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === next.id ? next : x)) }))

  return (
    <div className="stack-lg">
      <PageHeader title="Customer feedback" subtitle="Star ratings and comments from your clients." />

      <Card title="Overview">
        <p className="card-intro">The average rating and how the ratings are spread.</p>
        <div className="feedback-overview">
          <div className="feedback-average">
            <span className="feedback-average-number">{totalCount ? averageRating.toFixed(1) : '–'}</span>
            <Stars rating={averageRating} size="lg" />
            <span className="muted small">{totalCount} rating{totalCount === 1 ? '' : 's'}</span>
          </div>
          <ul className="rating-bars" aria-label="Ratings by number of stars">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = countsByRating[r] ?? 0
              return (
                <li key={r}>
                  <span className="rating-bar-label">{r} star{r === 1 ? '' : 's'}</span>
                  <span className="rating-bar" aria-hidden="true"><i style={{ width: `${totalCount ? (count / totalCount) * 100 : 0}%` }} /></span>
                  <span className="rating-bar-count">{count}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </Card>

      <Card title="All feedback" actions={list.loading ? <Spinner small label="Refreshing" /> : null}>
        <p className="card-intro">
          Newest first. Switch a comment on to show it on the home page under What clients say, with the client&apos;s first name and last initial.
        </p>
        {shownOnHome != null && <p className="muted small feedback-home-count">{shownOnHome} of {HOME_LIMIT} shown on the home page.</p>}
        {items.length === 0 ? (
          <EmptyState title="No feedback yet">When clients leave a rating, it shows up here.</EmptyState>
        ) : (
          <ul className="feedback-list">
            {items.map((f) => {
              const name = f.client ? `${f.client.firstName} ${f.client.lastName}` : 'Client'
              return (
                <li key={f.id} className="feedback-item">
                  <span className="feedback-avatar" aria-hidden="true">{initials(name)}</span>
                  <div className="feedback-body">
                    <div className="feedback-meta">
                      <strong>{name}</strong>
                      <span className="muted small">{formatDate(toIsoDate(new Date(f.createdAt)))}</span>
                      <Stars rating={f.rating} size="sm" />
                    </div>
                    {f.comment ? <p className="feedback-comment">{f.comment}</p> : <p className="muted small">No comment</p>}
                    {f.comment && <ShowOnHome item={f} onSaved={(next) => { replace(next); home.reload() }} />}
                    <FeedbackReply item={f} onSaved={replace} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <Pager page={page} pages={pages} onChange={setPage} />
      </Card>
    </div>
  )
}

/**
 * Puts a comment on the home page, or takes it off. The switch only moves once the server agrees, so a refusal (the
 * home page is full) leaves it off, with the reason under it.
 */
function ShowOnHome({ item, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const change = async (e) => {
    const show = e.target.checked
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.admin.showFeedbackOnHome(item.id, show))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="feedback-home">
      <label className="switch">
        <input type="checkbox" aria-label="Show on home page" checked={item.showOnHome} disabled={saving} onChange={change} />
        <span className="switch-track" aria-hidden="true" />
        <span className="switch-text" aria-hidden="true">{item.showOnHome ? 'On the home page' : 'Show on home page'}</span>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

/** Leyah's reply, which the client sees on their Feedback page. */
function FeedbackReply({ item, onSaved }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(item.reply ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const save = async (value) => {
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.admin.replyToFeedback(item.id, value))
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return item.reply ? (
      <div className="feedback-reply">
        <span className="feedback-reply-label">Your reply</span>
        <p>{item.reply}</p>
        <Button variant="ghost" size="sm" onClick={() => { setText(item.reply); setOpen(true) }}>Edit reply</Button>
      </div>
    ) : (
      <Button variant="ghost" size="sm" className="feedback-reply-open" onClick={() => setOpen(true)}>Reply</Button>
    )
  }
  return (
    <div className="feedback-reply-form">
      <label className="sr-only" htmlFor={`reply-${item.id}`}>Reply to this feedback</label>
      <textarea id={`reply-${item.id}`} className="input textarea" rows={2} maxLength={LIMITS.feedbackReplyMax} value={text}
        placeholder="Thank you so much! See you next time." onChange={(e) => setText(e.target.value)} />
      <p className="muted small">The client sees your reply on their Feedback page.</p>
      {error && <div className="field-error">{error}</div>}
      <div className="feedback-reply-actions">
        {item.reply && <Button variant="danger-ghost" size="sm" disabled={saving} onClick={() => save(null)}>Remove reply</Button>}
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" loading={saving} disabled={!text.trim()} onClick={() => save(text.trim())}>Send reply</Button>
      </div>
    </div>
  )
}

/** "Kyla Santos" → "KS" */
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
