import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const photoFile = (name = 'lace.png') => new File([PNG], name, { type: 'image/png' })

function seedPhotos(count) {
  const db = getDb()
  db.galleryPhotos = Array.from({ length: count }, (_, i) => ({ id: 500 + i, caption: `Set ${i + 1}`, createdAt: '2026-11-10T00:00:00Z', dataUrl: TINY_PNG }))
  saveDb()
}

const openGallery = async () => {
  await signIn(ADMIN)
  renderApp('/admin/gallery')
  return screen.findByRole('heading', { name: 'Gallery' })
}

describe('Admin gallery polish', () => {
  it('1: a drop zone instead of the browser file box, with a preview before adding', async () => {
    const user = userEvent.setup()
    await openGallery()
    const zone = screen.getByText(/Choose a photo or drag it here/).closest('.photo-drop')
    expect(screen.getByLabelText('Photo')).toHaveClass('sr-only') // the real input stays for keyboards and screen readers

    await user.upload(screen.getByLabelText('Photo'), photoFile())
    const preview = await within(zone).findByRole('img', { name: 'Selected photo: lace.png' })
    expect(preview.getAttribute('src')).toMatch(/^(data:image\/png|blob:)/)
    await user.click(within(zone).getByRole('button', { name: 'Clear selected photo' }))
    expect(within(zone).queryByRole('img')).toBeNull()

    fireEvent.drop(zone, { dataTransfer: { files: [photoFile('dropped.png')] } })
    expect(await within(zone).findByRole('img', { name: 'Selected photo: dropped.png' })).toBeInTheDocument()
  })

  it('2: photo on one side, caption and button on the other', async () => {
    await openGallery()
    const form = document.querySelector('.gallery-add')
    expect(form.querySelector(':scope > .gallery-add-photo .photo-drop')).not.toBeNull()
    expect(within(form.querySelector(':scope > .gallery-add-details')).getByLabelText(/^Caption/)).toBeInTheDocument()
  })

  it('3: counts photos against the limit of 30, and stops at 30', async () => {
    seedPhotos(30)
    await openGallery()
    expect(await screen.findByRole('heading', { name: 'Your photos · 30 of 30' })).toBeInTheDocument()
    expect(screen.getByText("You've reached 30 photos. Remove one to add another.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to the home page' })).toBeDisabled()
  })

  it('4: removing asks in the site’s own dialog, showing the photo', async () => {
    seedPhotos(2)
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    await openGallery()

    await user.click(await screen.findByRole('button', { name: 'Remove Set 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove this photo?' })
    expect(within(dialog).getByRole('img', { name: 'Set 1' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove photo' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Set 1' })).toBeNull())
    expect(screen.getByRole('heading', { name: 'Your photos · 1 of 30' })).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('5: each photo is a square tile with its caption under it', async () => {
    seedPhotos(1)
    await openGallery()
    const tile = (await screen.findByRole('img', { name: 'Set 1' })).closest('li')
    expect(tile).toHaveClass('gallery-tile')
    expect(within(tile).getByText('Set 1')).toHaveClass('gallery-tile-caption')
  })
})

describe('Admin gallery: audit fixes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('the Change control is a real button that opens the file picker', async () => {
    const user = userEvent.setup()
    await openGallery()
    await user.upload(screen.getByLabelText('Photo'), photoFile())
    const open = vi.spyOn(screen.getByLabelText('Photo'), 'click')
    await user.click(await screen.findByRole('button', { name: 'Change photo' }))
    expect(open).toHaveBeenCalled()
  })

  it('tells screen readers which photo was picked', async () => {
    const user = userEvent.setup()
    await openGallery()
    await user.upload(screen.getByLabelText('Photo'), photoFile())
    expect(await screen.findByText('lace.png selected')).toHaveAttribute('aria-live', 'polite')
  })

  it('keeps the drop highlight while the photo moves over the text inside the zone', async () => {
    await openGallery()
    const zone = document.querySelector('.photo-drop')
    fireEvent.dragOver(zone)
    expect(zone).toHaveClass('is-dragging')
    // jsdom's drag events drop relatedTarget, so the same "dragleave" is sent as a mouse event that keeps it.
    const leave = (to) => fireEvent(zone, new MouseEvent('dragleave', { bubbles: true, relatedTarget: to }))
    leave(zone.querySelector('strong'))
    expect(zone).toHaveClass('is-dragging')
    leave(document.body)
    expect(zone).not.toHaveClass('is-dragging')
  })

  it('previews through a light object URL and frees it when cleared', async () => {
    URL.createObjectURL ??= () => ''
    URL.revokeObjectURL ??= () => {}
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const user = userEvent.setup()
    await openGallery()
    await user.upload(screen.getByLabelText('Photo'), photoFile())
    expect(await screen.findByRole('img', { name: 'Selected photo: lace.png' })).toHaveAttribute('src', 'blob:preview-1')
    await user.click(screen.getByRole('button', { name: 'Clear selected photo' }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:preview-1')
  })

  it('edits a caption in place, and an empty caption removes it', async () => {
    const user = userEvent.setup()
    seedPhotos(1)
    await openGallery()

    await user.click(screen.getByRole('button', { name: 'Edit the caption of Set 1' }))
    const field = screen.getByLabelText(/^Caption \(the design\)/)
    await user.clear(field)
    await user.type(field, 'Pink French tips with hand-painted flowers')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Caption saved.')).toBeInTheDocument()
    expect(screen.getByText('Pink French tips with hand-painted flowers')).toBeInTheDocument()
    expect(getDb().galleryPhotos[0].caption).toBe('Pink French tips with hand-painted flowers')

    await user.click(screen.getByRole('button', { name: 'Edit the caption of Pink French tips with hand-painted flowers' }))
    await user.clear(screen.getByLabelText(/^Caption \(the design\)/))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('No caption')).toBeInTheDocument()
    expect(getDb().galleryPhotos[0].caption).toBeNull()
  })

  it('shows three rows of photos at a time, with Previous and Next', async () => {
    const user = userEvent.setup()
    seedPhotos(16)
    await openGallery()

    // Five to a row here (the default before the screen is measured): 15 on page 1, the last one on page 2.
    expect(document.querySelectorAll('.gallery-tile')).toHaveLength(15)
    expect(screen.getByText('Showing 1–15 of 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(document.querySelectorAll('.gallery-tile')).toHaveLength(1)
    expect(screen.getByText('Showing 16–16 of 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(document.querySelectorAll('.gallery-tile')).toHaveLength(15)
  })
})
