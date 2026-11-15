import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { softGelSets } from '../../lib/services'
import { ColorStockCard } from './BookingRulesCards'
import { errorMessage, fieldErrors } from '../../api/errors'
import { LIMITS, validateDuration, validatePrice, validateServiceDescription, validateServiceName } from '../../validation/rules'
import { Alert, Button, Card, Money, PageHeader, PageLoader, SelectField, TextField } from '../../components/ui'
import { Modal } from '../../components/Modal'

/** Update prices, service durations and add-ons without code changes (Ref 11.3). */
export default function ServicesPage() {
  const catalog = useAsync(() => api.admin.services(), [])
  const navigate = useNavigate()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [dirtyRows, setDirtyRows] = useState({}) // row key -> has unsaved changes
  const [removing, setRemoving] = useState(null) // { item, kind } waiting for "Remove?"
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(null) // a link Leyah clicked while changes were unsaved

  const unsaved = Object.values(dirtyRows).filter(Boolean).length
  const markDirty = useCallback((key, dirty) => setDirtyRows((rows) => (Boolean(rows[key]) === dirty ? rows : { ...rows, [key]: dirty })), [])

  // Closing or reloading the tab with unsaved changes: the browser asks first.
  useEffect(() => {
    if (!unsaved) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // Moving to another page of the site with unsaved changes: the site asks first, in its own dialog.
  useEffect(() => {
    if (!unsaved) return undefined
    const intercept = (e) => {
      const link = e.target.closest?.('a[href]')
      if (!link || link.target === '_blank' || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const to = new URL(link.href, window.location.href)
      if (to.origin !== window.location.origin || to.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      setLeaving(`${to.pathname}${to.search}${to.hash}`)
    }
    document.addEventListener('click', intercept, true)
    return () => document.removeEventListener('click', intercept, true)
  }, [unsaved])

  if (catalog.loading && !catalog.data) return <PageLoader label="Loading services…" />
  if (catalog.error) return <Alert kind="error">{errorMessage(catalog.error)}</Alert>

  const changed = (text) => {
    setMessage(text)
    catalog.reload()
  }

  const remove = async () => {
    const { item, kind } = removing
    setBusy(true)
    setError(null)
    try {
      if (kind === 'service') await api.admin.deleteService(item.id)
      else await api.admin.deleteAddOn(item.id)
      markDirty(`${kind}-${item.id}`, false)
      setRemoving(null)
      changed(`${item.name} removed.`)
    } catch (err) {
      setRemoving(null)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Main services are listed under their category (Soft Gel, Removal) instead of repeating it on every row. Soft Gel
  // follows the booking page: Plain, Soft Gel Extension, BIAB, each with its "with design" version right under it.
  const groups = [...new Set(catalog.data.services.map((s) => s.category))]
    .map((value) => {
      const items = value === 'SoftGel'
        ? softGelSets(catalog.data.services).flatMap(({ base, design }) => [{ item: base }, ...(design ? [{ item: design, designOf: base }] : [])])
        : catalog.data.services.filter((s) => s.category === value).map((item) => ({ item }))
      return { value, label: items[0].item.categoryLabel, items }
    })
  const row = (item, kind, designOf) => (
    <CatalogRow key={item.id} item={item} kind={kind} designOf={designOf} onChanged={changed}
      onDirty={markDirty} onRemove={(it) => setRemoving({ item: it, kind })} />
  )

  return (
    <div className="stack-lg">
      <PageHeader title="Services & prices" subtitle="Changes apply to new bookings only; existing bookings keep their price and length. The length decides which times clients can book." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {unsaved > 0 && (
        <div className="unsaved-bar" role="status" aria-label="Unsaved changes">
          {unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'} · press Save on each highlighted row, or Undo
        </div>
      )}

      <Card title="Main services">
        <p className="card-intro">The price and appointment length of each service.</p>
        <div className="catalog">
          <CatalogHead kind="service" />
          {groups.map((g) => (
            <section key={g.value} className="catalog-group" aria-label={g.label}>
              <h3 className="list-group-title">{g.label}<span>{g.items.length}</span></h3>
              {g.items.map(({ item, designOf }) => row(item, 'service', designOf))}
            </section>
          ))}
        </div>
        <NewItemForm kind="service" onCreated={changed} />
      </Card>

      <Card title="Nail art (add-ons)">
        <p className="card-intro">Priced per nail and added to a set, the way clients see them under Nail Art when booking.</p>
        <div className="catalog">
          <CatalogHead kind="addOn" />
          {catalog.data.addOns.map((item) => row(item, 'addOn', null))}
        </div>
        <NewItemForm kind="addOn" onCreated={changed} />
      </Card>

      <ColorStockCard />

      {removing && (
        <Modal title={`Remove ${removing.item.name}?`} onClose={() => !busy && setRemoving(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>Keep it</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Remove</Button>
          </>}>
          <p>It comes off the price list, so clients can no longer book it. Past bookings are not affected.</p>
        </Modal>
      )}
      {leaving && (
        <Modal title="Leave without saving?" onClose={() => setLeaving(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setLeaving(null)}>Stay on this page</Button>
            <Button variant="danger" onClick={() => { const to = leaving; setLeaving(null); setDirtyRows({}); navigate(to) }}>Leave</Button>
          </>}>
          <p>{unsaved} {unsaved === 1 ? 'row has' : 'rows have'} changes that aren&apos;t saved yet. Leaving drops them.</p>
        </Modal>
      )}
    </div>
  )
}

/** Column titles. Both lists use the same columns, so prices line up from one card to the next. */
function CatalogHead({ kind }) {
  return (
    <div className="catalog-head" aria-hidden="true">
      <span>Name</span>
      <span>{kind === 'addOn' ? 'Price per nail' : 'Price'}</span>
      <span>{kind === 'service' ? 'Length' : ''}</span>
      <span>{kind === 'service' ? 'Offered · Nail art' : 'Offered'}</span>
      <span />
    </div>
  )
}

function CatalogRow({ item, kind, onChanged, onDirty, onRemove, designOf = null }) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(String(item.price))
  const [duration, setDuration] = useState(String(item.durationMinutes ?? ''))
  const [isActive, setIsActive] = useState(item.isActive)
  const [allowsAddOns, setAllowsAddOns] = useState(Boolean(item.allowsAddOns))
  const [description, setDescription] = useState(item.description ?? '')
  const [lineOpen, setLineOpen] = useState(Boolean(item.description))
  const [lineFocused, setLineFocused] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const isService = kind === 'service'
  // Only a new set can take nail art; a removal never does.
  const canTakeStones = isService && item.category === 'SoftGel'
  // The line on the home page's service card. A design version shares its set's card, so it has none.
  const hasDescription = isService && !designOf
  const lineChanged = hasDescription && description.trim() !== (item.description ?? '')
  const dirty = name !== item.name || Number(price) !== item.price || isActive !== item.isActive
    || (isService && !designOf && Number(duration) !== item.durationMinutes) || (canTakeStones && allowsAddOns !== Boolean(item.allowsAddOns))
    || lineChanged

  const key = `${kind}-${item.id}`
  useEffect(() => { onDirty(key, dirty) }, [key, dirty, onDirty])
  useEffect(() => () => onDirty(key, false), [key, onDirty])

  const undo = () => {
    setName(item.name)
    setPrice(String(item.price))
    setDuration(String(item.durationMinutes ?? ''))
    setIsActive(item.isActive)
    setAllowsAddOns(Boolean(item.allowsAddOns))
    setDescription(item.description ?? '')
    setLineOpen(Boolean(item.description))
    setErrors({})
  }

  const save = async () => {
    const found = Object.fromEntries([['name', validateServiceName(name)], ['price', validatePrice(price)],
      ['durationMinutes', isService ? validateDuration(duration) : null],
      ['description', hasDescription ? validateServiceDescription(description) : null]].filter(([, m]) => m))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const body = { name, price: Number(price), isActive }
      if (isService) await api.admin.updateService(item.id, { ...body, durationMinutes: Number(duration), ...(canTakeStones && { allowsAddOns }),
        ...(hasDescription && { description: description.trim() }) })
      else await api.admin.updateAddOn(item.id, body)
      onChanged(`${name} saved.`)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`catalog-row${dirty ? ' is-dirty' : ''}${isActive ? '' : ' is-inactive'}${designOf ? ' is-design' : ''}`}>
      <div className="catalog-cell catalog-name">
        <input className="input input-compact" aria-label={`Name of ${item.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {designOf && <span className="catalog-tag" title={`The "With Design" option on ${designOf.name}`}>With design</span>}
        {errors.name && <div className="field-error">{errors.name}</div>}
      </div>
      <div className="catalog-cell" data-label={isService ? 'Price' : 'Price per nail'}>
        {designOf ? (
          // A design version follows its set: the set's price + ₱100 and its time + 1 hour, so there is nothing to type.
          <>
            <span className="catalog-fixed"><Money amount={item.price} /></span>
            <div className="catalog-was">{designOf.name} + <Money amount={100} /></div>
          </>
        ) : (
          <>
            <div className="affix">
              <span className="affix-text">₱</span>
              <input className="input input-compact" type="number" min="0" step="1" aria-label={`Price of ${item.name}`}
                value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            {errors.price && <div className="field-error">{errors.price}</div>}
            {!errors.price && Number(price) !== item.price && <div className="catalog-was">was <Money amount={item.price} /></div>}
          </>
        )}
      </div>
      <div className="catalog-cell" data-label={isService ? 'Length' : undefined}>
        {isService && (designOf ? (
          <>
            <span className="catalog-fixed">{item.durationMinutes} min</span>
            <div className="catalog-was">+1 hr</div>
          </>
        ) : (
          <>
            <div className="affix affix-end">
              <input className="input input-compact" type="number" min="15" max="480" step="5" aria-label={`Duration of ${item.name} in minutes`}
                value={duration} onChange={(e) => setDuration(e.target.value)} />
              <span className="affix-text">min</span>
            </div>
            {errors.durationMinutes && <div className="field-error">{errors.durationMinutes}</div>}
          </>
        ))}
      </div>
      <div className="catalog-cell catalog-switches" data-label="Offered">
        <label className="switch">
          <input type="checkbox" aria-label={`${item.name} is offered`} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-text" aria-hidden="true">{isActive ? 'Yes' : 'No'}</span>
        </label>
        {canTakeStones && (
          <label className="switch switch-sub" title="Whether clients can add nail art to this service">
            <input type="checkbox" aria-label={`${item.name} takes nail art`} checked={allowsAddOns} onChange={(e) => setAllowsAddOns(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            <span className="switch-text" aria-hidden="true">{allowsAddOns ? 'Takes nail art' : 'No nail art'}</span>
          </label>
        )}
      </div>
      <div className="catalog-cell catalog-actions">
        <div className="row-actions">
          {/* Save and Undo only when this row has changes; Remove is always there. */}
          {dirty && <Button size="sm" loading={saving} onClick={save}>Save</Button>}
          {dirty && <Button variant="secondary" size="sm" disabled={saving} aria-label={`Undo changes to ${item.name}`} onClick={undo}>Undo</Button>}
          {!dirty && <Button variant="danger-ghost" size="sm" disabled={saving} aria-label={`Remove ${item.name}`} onClick={() => onRemove(item)}>Remove</Button>}
        </div>
        {errors.form && <div className="field-error">{errors.form}</div>}
      </div>
      {hasDescription && (
        <div className="catalog-cell catalog-desc">
          {lineOpen ? (
            <>
              <label className="catalog-desc-label" htmlFor={`desc-${item.id}`}>Home page line</label>
              <input id={`desc-${item.id}`} aria-label={`Home page line for ${item.name}`} className="input input-compact" maxLength={LIMITS.serviceDescriptionMax} value={description}
                placeholder="Leave empty to use the website's own line" aria-describedby={`desc-hint-${item.id}`}
                onFocus={() => setLineFocused(true)} onBlur={() => setLineFocused(false)}
                onChange={(e) => setDescription(e.target.value)} />
              <div className="catalog-was" id={`desc-hint-${item.id}`}>
                {item.category === 'Removal' ? 'Shown on the Removal card (the first removal with a line is used).' : 'Shown under the name on its home page card.'}
                {(lineFocused || lineChanged) && <> {description.trim().length}/{LIMITS.serviceDescriptionMax}</>}
              </div>
              {errors.description && <div className="field-error">{errors.description}</div>}
            </>
          ) : (
            <div className="catalog-desc-folded">
              <span className="muted small">Home page line: website&apos;s own line</span>
              <button type="button" className="link-button" aria-label={`Edit home page line for ${item.name}`} onClick={() => setLineOpen(true)}>Edit</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CATEGORIES = [
  { value: 'SoftGel', label: 'Soft Gel' },
  { value: 'Removal', label: 'Removal' },
]

function NewItemForm({ kind, onCreated }) {
  const [category, setCategory] = useState('SoftGel')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('60')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const isService = kind === 'service'

  const submit = async (e) => {
    e.preventDefault()
    const found = Object.fromEntries([['name', validateServiceName(name)], ['price', validatePrice(price)],
      ['durationMinutes', isService ? validateDuration(duration) : null]].filter(([, m]) => m))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      if (isService) await api.admin.createService({ category, name, price: Number(price), durationMinutes: Number(duration) })
      else await api.admin.createAddOn({ name, price: Number(price) })
      setName('')
      setPrice('')
      onCreated(`${name} added to the price list.`)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  // Same columns as the list above, so the new item's fields sit under the matching column.
  return (
    <form className="catalog-add" onSubmit={submit} noValidate>
      <h3>Add {isService ? 'a service' : 'an add-on'}</h3>
      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      <div className="catalog-add-fields">
        <div className={isService ? 'catalog-add-name with-category' : 'catalog-add-name'}>
          {isService && <SelectField label="Category" value={category} options={CATEGORIES} onChange={(e) => setCategory(e.target.value)} />}
          <TextField label="Name" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        </div>
        <TextField label={isService ? 'Price (₱)' : 'Price per nail (₱)'} type="number" min="0" value={price} error={errors.price}
          onChange={(e) => setPrice(e.target.value)} />
        {isService
          ? <TextField label="Length (min)" type="number" min="15" max="480" step="5" value={duration} error={errors.durationMinutes}
              onChange={(e) => setDuration(e.target.value)} />
          : <span className="catalog-spacer" />}
        <Button type="submit" loading={saving}>Add</Button>
      </div>
    </form>
  )
}
