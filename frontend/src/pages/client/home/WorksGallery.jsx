import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../../api'
import { useAsync } from '../../../hooks/useAsync'
import { galleryPhotoSrc } from '../../admin/GalleryPage'
import { canAnimate, photo } from './motion'
import { SectionHeading } from './SectionHeading'

/** How many works the home page shows; the rest are on /gallery. */
export const HOME_WORKS = 9

// The built-in photos keep the grid full until Leyah has uploaded enough of her own (Management > Gallery).
const BUILT_IN = Array.from({ length: 13 }, (_, i) => ({ key: `set-${i + 1}`, src: photo(i + 1), alt: `Nail set ${i + 1}` }))

/** Every work in showing order: Leyah's uploads (the API lists the newest first), then the built-in photos. */
export function galleryPhotos(uploads = []) {
  return [
    ...uploads.map((p) => ({ key: `photo-${p.id}`, src: galleryPhotoSrc(p), alt: p.caption || 'A nail set by Leyah' })),
    ...BUILT_IN,
  ]
}

/** The works, with `loaded` once Leyah's uploads have been asked for. A gallery that can't load leaves the built-in photos. */
export function useGalleryPhotos() {
  const uploads = useAsync(() => api.gallery.list().catch(() => []), [])
  return { items: galleryPhotos(uploads.data ?? []), loaded: !uploads.loading }
}

/**
 * Square photo tiles; each opens the photo larger. The tiles fade up once (one after another) when the grid scrolls
 * into view and the uploads are in, so the built-in photos never flash before Leyah's replace them.
 */
export function WorksGrid({ items, loaded, onOpen }) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(!canAnimate)

  useEffect(() => {
    if (seen) return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true) }, { threshold: 0.1 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])

  return (
    <ul className={seen && loaded ? 'works-grid is-in' : 'works-grid'} ref={ref}>
      {items.map((item, i) => (
        <li key={item.key} style={{ '--i': Math.min(i, 11) }}>
          <button type="button" className="works-tile" aria-label={`View ${item.alt}`}
            onClick={(e) => onOpen({ src: item.src, alt: item.alt }, e.currentTarget)}>
            <img src={item.src} alt="" loading="lazy" decoding="async" width="600" height="600" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Our Works on the home page: nine works in a 3 × 3 grid, then a link to every photo on /gallery (D8). */
export function WorksGallery({ onOpen }) {
  const { items, loaded } = useGalleryPhotos()
  return (
    <section className="hm-works hm-section" id="gallery" tabIndex={-1} aria-labelledby="works-title">
      <SectionHeading id="works-title" title="Our Works" intro="Soft gel, BIAB and nail art, crafted by Leyah." />
      <WorksGrid items={items.slice(0, HOME_WORKS)} loaded={loaded} onOpen={onOpen} />
      <Link to="/gallery" className="works-more">View full gallery<span aria-hidden="true">→</span></Link>
    </section>
  )
}

/** Full-size photo. Click anywhere, × or Escape to close; focus returns to the photo that opened it. */
export function PhotoViewer({ photo: current, open, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={open ? 'hm-viewer open' : 'hm-viewer'} role="dialog" aria-modal="true" aria-label="Nail set photo"
      aria-hidden={!open} onClick={onClose}>
      {current && <img src={current.src} alt={current.alt} />}
      <button type="button" className="hm-viewer-close" ref={closeRef} aria-label="Close" tabIndex={open ? 0 : -1}>×</button>
    </div>
  )
}

/** Opens and closes the photo viewer; focus goes back to whatever opened it. */
export function usePhotoViewer() {
  const [viewer, setViewer] = useState({ open: false, photo: null })
  const opener = useRef(null)
  const [handlers] = useState(() => ({
    open: (photo, from) => { opener.current = from; setViewer({ open: true, photo }) },
    close: () => {
      setViewer((v) => ({ ...v, open: false }))
      opener.current?.focus({ preventScroll: true })
      opener.current = null
    },
  }))
  return { ...viewer, openPhoto: handlers.open, closePhoto: handlers.close }
}
