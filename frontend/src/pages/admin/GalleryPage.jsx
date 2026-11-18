import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { config } from '../../config'
import { LIMITS, REFERENCE_IMAGE_ACCEPT, validateReferenceImage } from '../../validation/rules'
import { shrinkImage } from '../../lib/shrinkImage'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader, TextField } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { ListPaging, usePageParam } from '../../components/ListPaging'

/** Where an uploaded gallery photo is served: the API's address, or the test backend's data URL. */
export const galleryPhotoSrc = (photo) =>
  photo.dataUrl ?? (/^https?:/.test(photo.url) ? photo.url : `${config.apiBaseUrl.replace(/\/$/, '')}${photo.url.replace(/^\/api/, '')}`)

/** The home page keeps at most this many of Leyah's own photos (GalleryPhoto.MaxPhotos on the server). */
const MAX_PHOTOS = 30

/** "Your photos" shows three rows at a time, however many photos fit in a row on this screen. */
const ROWS_PER_PAGE = 3

/** How many tiles fit in one row of the grid right now (it changes with the screen width). */
function useGridColumns() {
  const [columns, setColumns] = useState(5)
  const observer = useRef(null)
  const ref = useCallback((el) => {
    observer.current?.disconnect()
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setColumns(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length))
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
    measure()
  }, [])
  return [columns, ref]
}

/**
 * A photo's caption under its tile: the design clients see beside the larger photo. "Edit" changes it in place;
 * an empty caption removes it.
 */
function TileCaption({ photo, onSaved, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(photo.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const name = photo.caption ?? 'this photo'

  const start = () => { setText(photo.caption ?? ''); setError(null); setEditing(true) }
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.admin.updateGalleryCaption(photo.id, text.trim() || null))
      setEditing(false)
    } catch (err) {
      setError(fieldErrors(err).caption ?? errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form className="gallery-tile-edit" onSubmit={save} noValidate>
        <TextField label="Caption (the design)" maxLength={LIMITS.galleryCaptionMax} value={text} error={error} autoFocus
          placeholder="e.g. Pink French tips with hand-painted flowers" onChange={(e) => setText(e.target.value)} />
        <div className="gallery-tile-edit-actions">
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" size="sm" loading={saving}>Save</Button>
        </div>
      </form>
    )
  }
  return (
    <div className="gallery-tile-foot">
      {photo.caption
        ? <span className="gallery-tile-caption" title={photo.caption}>{photo.caption}</span>
        : <span className="gallery-tile-caption muted">No caption</span>}
      <span className="gallery-tile-buttons">
        <Button variant="ghost" size="sm" aria-label={`Edit the caption of ${name}`} onClick={start}>Edit</Button>
        <Button variant="danger-ghost" size="sm" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</Button>
      </span>
    </div>
  )
}

/**
 * Leyah's photos for the home page's Our Works gallery. New photos show first, before the photos of her work that came
 * with the site.
 */
export default function GalleryPage() {
  const photos = useAsync(() => api.admin.gallery(), [])
  const [message, setMessage] = useState(null)
  const [confirming, setConfirming] = useState(null) // the photo Leyah is about to remove
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState(null)
  const [columns, gridRef] = useGridColumns()
  const { page, goTo } = usePageParam('.gallery-admin')

  if (photos.loading && !photos.data) return <PageLoader label="Loading photos…" />
  if (photos.error) return <Alert kind="error">{errorMessage(photos.error)}</Alert>

  const count = photos.data.length
  const full = count >= MAX_PHOTOS
  const pageSize = columns * ROWS_PER_PAGE
  // A removed photo can leave the last page empty: show the page before it instead.
  const current = Math.min(page, Math.max(1, Math.ceil(count / pageSize)))
  const shown = photos.data.slice((current - 1) * pageSize, current * pageSize)

  const remove = async () => {
    const photo = confirming
    setRemoving(true)
    setError(null)
    try {
      await api.admin.removeGalleryPhoto(photo.id)
      photos.setData((list) => list.filter((p) => p.id !== photo.id))
      setMessage('Photo removed.')
      setConfirming(null)
    } catch (err) {
      setError(errorMessage(err))
      setConfirming(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader title="Gallery" subtitle="Photos of your work for the home page's Our Works section. The newest shows first." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <AddPhoto full={full} onAdded={(photo) => { photos.setData((list) => [photo, ...list]); setMessage('Photo added to the home page.') }} />
      <Card title={`Your photos · ${count} of ${MAX_PHOTOS}`}>
        {count === 0 ? (
          <EmptyState title="No photos added yet">Until you add your own, the home page shows the photos of your work that came with the site. Once you add photos here, the home page shows yours, newest first.</EmptyState>
        ) : (
          <>
          <ul className="gallery-admin" ref={gridRef}>
            {shown.map((p) => (
              <li key={p.id} className="gallery-tile">
                <img src={galleryPhotoSrc(p)} alt={p.caption ?? 'Gallery photo'} loading="lazy" />
                <TileCaption photo={p} onRemove={() => setConfirming(p)}
                  onSaved={(updated) => { photos.setData((list) => list.map((x) => (x.id === updated.id ? updated : x))); setMessage('Caption saved.') }} />
              </li>
            ))}
          </ul>
          <ListPaging page={current} count={count} pageSize={pageSize} onChange={goTo} noun={['photo', 'photos']} />
          </>
        )}
      </Card>
      {confirming && (
        <Modal title="Remove this photo?" onClose={() => !removing && setConfirming(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={removing}>Keep it</Button>
            <Button variant="danger" onClick={remove} loading={removing}>Remove photo</Button>
          </>}>
          <div className="gallery-confirm">
            <img src={galleryPhotoSrc(confirming)} alt={confirming.caption ?? 'Gallery photo'} />
            <p>It comes off the home page&apos;s Our Works straight away. The photos of your work that came with the site stay.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AddPhoto({ full, onAdded }) {
  const inputId = useId()
  const input = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [caption, setCaption] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // The preview: a light object URL where the browser has one (freed when no longer shown), else a data URL.
  const previewUrl = useRef(null)
  const freePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
  }
  useEffect(() => freePreview, [])

  const clear = () => {
    freePreview()
    setFile(null)
    setPreview(null)
    if (input.current) input.current.value = ''
  }

  const pick = (chosen) => {
    setErrors({})
    if (!chosen) return clear()
    const problem = validateReferenceImage(chosen)
    // Too large is fine: it is shrunk before it is sent.
    if (problem && !/large|size/i.test(problem)) {
      clear()
      setErrors({ file: problem })
      return undefined
    }
    freePreview()
    setFile(chosen)
    if (typeof URL.createObjectURL === 'function') {
      previewUrl.current = URL.createObjectURL(chosen)
      setPreview(previewUrl.current)
    } else {
      const reader = new FileReader()
      reader.onload = () => setPreview(String(reader.result))
      reader.readAsDataURL(chosen)
    }
    return undefined
  }

  const drop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!full) pick(e.dataTransfer?.files?.[0] ?? null)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!file) { setErrors({ file: 'Choose a photo.' }); return }
    setSaving(true)
    try {
      const ready = await shrinkImage(file)
      onAdded(await api.admin.addGalleryPhoto(ready, caption.trim() || null))
      clear()
      setCaption('')
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Add a photo">
      <form className="gallery-add" onSubmit={submit} noValidate>
        <div className="gallery-add-photo">
          <div className={['photo-drop', dragging && 'is-dragging', preview && 'has-photo', full && 'is-disabled'].filter(Boolean).join(' ')}
            onDragOver={(e) => { e.preventDefault(); if (!full) setDragging(true) }} onDrop={drop}
            // Moving over the text inside the zone is still inside it: only leaving the zone ends the highlight.
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}>
            <input ref={input} id={inputId} className="sr-only" type="file" accept={REFERENCE_IMAGE_ACCEPT} disabled={full} aria-label="Photo"
              onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {preview ? (
              <>
                <img src={preview} alt={`Selected photo: ${file.name}`} />
                <div className="photo-drop-actions">
                  <button type="button" className="btn btn-secondary btn-sm" aria-label="Change photo" onClick={() => input.current?.click()}><span>Change</span></button>
                  <button type="button" className="btn btn-secondary btn-sm" aria-label="Clear selected photo" onClick={clear}><span>Clear</span></button>
                </div>
              </>
            ) : (
              <label htmlFor={inputId} className="photo-drop-empty">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
                <strong>Choose a photo or drag it here</strong>
                <span className="muted small">JPG, PNG or WebP. Large photos are shrunk for you.</span>
              </label>
            )}
          </div>
          <span className="sr-only" aria-live="polite">{file ? `${file.name} selected` : ''}</span>
          {errors.file && <div className="field-error">{errors.file}</div>}
        </div>
        <div className="gallery-add-details">
          {errors.form && <Alert kind="error">{errors.form}</Alert>}
          {full && <Alert kind="info">You&apos;ve reached {MAX_PHOTOS} photos. Remove one to add another.</Alert>}
          <TextField label="Caption (optional)" maxLength={LIMITS.galleryCaptionMax} value={caption} error={errors.caption}
            placeholder="e.g. Lace with silver studs" disabled={full} onChange={(e) => setCaption(e.target.value)} />
          <p className="muted small">Shown when someone opens the photo. A few words about the set are enough.</p>
          <div><Button type="submit" loading={saving} disabled={full}>Add to the home page</Button></div>
        </div>
      </form>
    </Card>
  )
}
