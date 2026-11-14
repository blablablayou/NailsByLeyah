import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ListPaging, usePageParam } from '../../components/ListPaging'
import { PhotoViewer, usePhotoViewer, useGalleryPhotos, WorksGrid } from './home/WorksGallery'
import { prefersReducedMotion } from './home/motion'
import '../../styles/home.css'

/** Four rows of three per page; the fifth row starts page 2. */
export const GALLERY_PAGE_SIZE = 12

/** How long the current photos take to fade out (while the page glides up) before the next page swaps in. */
const LEAVE_MS = 420

/**
 * /gallery: every work, Leyah's uploads first, in the same square grid and photo viewer as Our Works on the home page
 * (decision D8), 12 to a page with the same page numbers as the admin lists (?page=2 in the address). Open to everyone.
 *
 * Changing page is smooth: the current photos fade out as the page glides back to the top, then the new page's photos
 * fade up one after another. The swap waits for the glide, since a shorter last page would otherwise cut it short.
 * With reduced motion the page simply changes.
 */
export default function WorksPage() {
  const { items, loaded } = useGalleryPhotos()
  const { open, photo, openPhoto, closePhoto } = usePhotoViewer()
  const { page: asked, goTo } = usePageParam('.works-page')
  const pages = Math.max(1, Math.ceil(items.length / GALLERY_PAGE_SIZE))
  const page = Math.min(asked, pages) // a page past the end (photos removed since) shows the last one
  const shown = items.slice((page - 1) * GALLERY_PAGE_SIZE, page * GALLERY_PAGE_SIZE)

  const [leaving, setLeaving] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const changePage = (n) => {
    if (prefersReducedMotion()) return goTo(n)
    clearTimeout(timer.current)
    setLeaving(true)
    document.querySelector('.works-page')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    timer.current = setTimeout(() => { goTo(n); setLeaving(false) }, LEAVE_MS)
  }

  return (
    <>
      <section className="works-page" aria-labelledby="works-page-title">
        <Link to="/" className="works-back"><span aria-hidden="true">←</span>Back to home</Link>
        <header className="works-page-head">
          <h1 id="works-page-title">Our Works</h1>
          <p>Soft gel, BIAB and nail art, crafted by Leyah. Tap a photo to see it larger.</p>
        </header>
        {/* Keyed by page, so each new page's photos fade up again, one after another. */}
        <div className={leaving ? 'works-swap is-leaving' : 'works-swap'}>
          <WorksGrid key={page} items={shown} loaded={loaded} onOpen={openPhoto} />
        </div>
        <ListPaging page={page} count={items.length} onChange={changePage} pageSize={GALLERY_PAGE_SIZE} noun={['photo', 'photos']} />
      </section>
      <PhotoViewer photo={photo} open={open} onClose={closePhoto} />
    </>
  )
}
