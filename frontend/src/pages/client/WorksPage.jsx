import { Link } from 'react-router'
import { PhotoViewer, usePhotoViewer, useGalleryPhotos, WorksGrid } from './home/WorksGallery'
import '../../styles/home.css'

/**
 * /gallery: every work, Leyah's uploads first, in the same square grid and photo viewer as Our Works on the home page
 * (decision D8). Open to everyone, signed in or not.
 */
export default function WorksPage() {
  const { items, loaded } = useGalleryPhotos()
  const { open, photo, openPhoto, closePhoto } = usePhotoViewer()

  return (
    <>
      <section className="works-page" aria-labelledby="works-page-title">
        <Link to="/" className="works-back"><span aria-hidden="true">←</span>Back to home</Link>
        <header className="works-page-head">
          <h1 id="works-page-title">Our Works</h1>
          <p>Soft gel, BIAB and nail art, crafted by Leyah. Tap a photo to see it larger.</p>
        </header>
        <WorksGrid items={items} loaded={loaded} onOpen={openPhoto} />
      </section>
      <PhotoViewer photo={photo} open={open} onClose={closePhoto} />
    </>
  )
}
