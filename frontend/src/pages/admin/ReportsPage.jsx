import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { addDays, today } from '../../lib/dates'
import { formatDate, formatMoney } from '../../lib/format'
import { downloadSalesReport, netReceived, totalReceived } from '../../lib/reportExcel'
import { Alert, Button, Card, Money, PageHeader, PageLoader } from '../../components/ui'
import { DayPicker, MonthPicker } from '../../components/DateFilter'

/** Daily and monthly sales reports (Ref 11.6). */
export default function ReportsPage() {
  const [tab, setTab] = useState('daily')
  return (
    <div className="stack report-page">
      <PageHeader title="Sales reports" />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'daily'} className={tab === 'daily' ? 'tab active' : 'tab'} onClick={() => setTab('daily')}>Daily</button>
        <button type="button" role="tab" aria-selected={tab === 'monthly'} className={tab === 'monthly' ? 'tab active' : 'tab'} onClick={() => setTab('monthly')}>Monthly</button>
      </div>
      {tab === 'daily' ? <DailyReport /> : <MonthlyReport />}
    </div>
  )
}

/**
 * "↑ ₱300.00 vs Nov 14", "↓ …", or "Same as Nov 14". Nothing while the earlier figures are still loading. Green means
 * better: for unpaid balances (lowerIsBetter) a fall is the good news.
 */
export function Change({ now, before, label, lowerIsBetter = false }) {
  if (before === undefined || before === null) return null
  const diff = Math.round((now - before) * 100) / 100
  if (diff === 0) return <span className="report-change">Same as {label}</span>
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return (
    <span className={better ? 'report-change better' : 'report-change worse'}>
      {diff > 0 ? '↑' : '↓'} {formatMoney(Math.abs(diff))} vs {label}
    </span>
  )
}

const isEmpty = (r) => !r.bookingsMade && !r.bookingsCompleted && !r.bookingsCancelled && !r.bookingsNoShow
  && !r.depositsCollected && !r.balancesReceived && !r.balancesUnpaid && !r.completedServicesValue && !r.refundsSent

/**
 * Money first, then booking counts. Each figure appears once: the total shows what it is made of underneath, and the
 * completed services show how many appointments they were. With the period before, each money figure shows its change.
 */
function Totals({ report, previous, previousLabel, soFar }) {
  const finished = report.bookingsCompleted
  const had = (pick) => (previous ? pick(previous) : undefined)
  return (
    <div className="report-totals">
      {isEmpty(report) && <p className="report-empty">Nothing was paid or booked on this {report.days ? 'month' : 'day'}.</p>}
      <section aria-label="Sales" className="report-money">
        <h3 className="report-section-title">Sales</h3>
        <div className="report-hero" role="group" aria-label="Net received">
          <span className="report-label">Net received</span>
          <span className="report-hero-value"><Money amount={netReceived(report)} /></span>
          <span className="report-hint">
            {formatMoney(report.depositsCollected)} online · {formatMoney(report.balancesReceived)} in balances
            {report.refundsSent > 0 && <> · −{formatMoney(report.refundsSent)} refunds sent</>}
          </span>
          {soFar && <span className="report-hint">{soFar}, compared with the whole of {previousLabel}</span>}
          <Change now={netReceived(report)} before={had(netReceived)} label={previousLabel} />
        </div>
        <div className="report-side">
          <div className="report-figure" role="group" aria-label="Completed services">
            <span className="report-label">Completed services</span>
            <span className="report-value"><Money amount={report.completedServicesValue} /></span>
            <span className="report-hint">{finished} appointment{finished === 1 ? '' : 's'} finished</span>
            <Change now={report.completedServicesValue} before={had((p) => p.completedServicesValue)} label={previousLabel} />
          </div>
          <div className="report-figure" role="group" aria-label="Balances unpaid">
            <span className="report-label">Balances unpaid</span>
            <span className="report-value"><Money amount={report.balancesUnpaid} /></span>
            <span className="report-hint">Completed, not recorded yet</span>
            <Change now={report.balancesUnpaid} before={had((p) => p.balancesUnpaid)} label={previousLabel} lowerIsBetter />
          </div>
        </div>
      </section>
      <section aria-label="Bookings">
        <h3 className="report-section-title">Bookings</h3>
        <dl className="report-counts">
          <div><dt><span className="stat-dot stat-dot-made" aria-hidden="true" />Made</dt><dd>{report.bookingsMade}</dd><dd className="report-hint">New bookings placed</dd></div>
          <div><dt><span className="stat-dot stat-dot-cancelled" aria-hidden="true" />Canceled</dt><dd>{report.bookingsCancelled}</dd><dd className="report-hint">By clients or the salon</dd></div>
          <div><dt><span className="stat-dot stat-dot-noshow" aria-hidden="true" />No-show</dt><dd>{report.bookingsNoShow}</dd><dd className="report-hint">Client did not come</dd></div>
        </dl>
      </section>
    </div>
  )
}

/**
 * Money received on each day of the month, one bar per day. Hovering a bar shows its day and amount (a mouse, or a
 * tap on a phone); the same figures are in a table for screen readers, so the bars are not separate Tab stops.
 */
function DayChart({ days }) {
  if (!days?.length) return null
  const values = days.map((d) => ({ date: d.date, amount: totalReceived(d) }))
  const max = Math.max(...values.map((v) => v.amount))
  const best = values.find((v) => v.amount === max)
  const sum = values.reduce((total, v) => total + v.amount, 0)
  const dayOf = (iso) => Number(iso.slice(8, 10))
  const summary = max > 0
    ? `Money received each day: highest ${formatMoney(max)} on ${formatDate(best.date)}, ${formatMoney(sum)} in all.`
    : 'Money received each day: nothing this month.'
  return (
    <section className="report-chart" aria-label="Money received each day">
      <div className="report-chart-head">
        <h3 className="report-section-title">Money received each day</h3>
        {max > 0 && <span className="report-hint">Highest {formatMoney(max)} on {formatDate(best.date)}</span>}
      </div>
      <div className="report-bars" role="img" aria-label={summary}>
        {values.map((v) => (
          <div key={v.date} className="report-bar-col">
            <span className={v.amount > 0 ? 'report-bar' : 'report-bar is-zero'} style={{ height: max > 0 ? `${(v.amount / max) * 100}%` : 0 }} />
            <span className="report-bar-tip" aria-hidden="true">{formatDate(v.date)}<strong>{formatMoney(v.amount)}</strong></span>
          </div>
        ))}
      </div>
      <div className="report-bar-axis" aria-hidden="true">
        {values.map((v) => <span key={v.date}>{[1, 5, 10, 15, 20, 25].includes(dayOf(v.date)) || v === values.at(-1) ? dayOf(v.date) : ''}</span>)}
      </div>
      <table className="sr-only">
        <caption>Money received each day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Received</th></tr></thead>
        <tbody>{values.map((v) => <tr key={v.date}><td>{formatDate(v.date)}</td><td>{formatMoney(v.amount)}</td></tr>)}</tbody>
      </table>
    </section>
  )
}

/** The period picker and its "Today" / "This month" jump on the left, the Excel download on the right. */
function ReportHeader({ title, report, fileName, children }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  const download = async () => {
    setDownloading(true)
    setError(null)
    try {
      await downloadSalesReport({ period: title, report, fileName })
    } catch {
      setError('The Excel file could not be made. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="report-head">
        <h2 className="sr-only">{title}</h2>
        <div className="report-period">{children}</div>
        <Button variant="secondary" className="report-download" loading={downloading} disabled={!report} onClick={download}>Download Excel</Button>
      </div>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
    </>
  )
}

// Reports for periods that are over don't change, so the "before" figures are kept instead of asked for again (the
// monthly report is slow on the server).
const pastReports = new Map()
function previousReport(key, isPast, load) {
  if (pastReports.has(key)) return pastReports.get(key)
  const request = load().catch(() => null)
  if (isPast) pastReports.set(key, request)
  return request
}

const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function DailyReport() {
  const [date, setDate] = useState(today())
  const report = useAsync(() => api.admin.dailyReport(date), [date])
  const before = addDays(date, -1)
  const previous = useAsync(() => (report.loading ? Promise.resolve(null)
    : previousReport(`day-${before}`, before < today(), () => api.admin.dailyReport(before))), [before, report.loading])
  return (
    <Card>
      <ReportHeader title={formatDate(date)} report={report.loading ? null : report.data} fileName={`nails-by-leyah-sales-${date}.xlsx`}>
        <DayPicker label="Day" value={date} onChange={(value) => value && setDate(value)} align="end" />
        {date !== today() && <Button variant="ghost" size="sm" onClick={() => setDate(today())}>Today</Button>}
      </ReportHeader>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && (
        <Totals report={report.data} previous={previous.loading ? null : previous.data} previousLabel={shortDay(before)}
          soFar={date === today() ? 'Today so far' : null} />
      )}
      <ReportNotes />
    </Card>
  )
}

function MonthlyReport() {
  const thisMonth = today().slice(0, 7)
  const [value, setValue] = useState(thisMonth)
  const [year, month] = value.split('-').map(Number)
  const report = useAsync(() => api.admin.monthlyReport(year, month), [year, month])
  const [prevYear, prevMonth] = month === 1 ? [year - 1, 12] : [year, month - 1]
  const prevKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  const previous = useAsync(() => (report.loading ? Promise.resolve(null)
    : previousReport(`month-${prevKey}`, prevKey < thisMonth, () => api.admin.monthlyReport(prevYear, prevMonth))), [prevKey, report.loading])
  const previousLabel = new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('en-PH', prevYear === year ? { month: 'long' } : { month: 'long', year: 'numeric' })

  return (
    <Card>
      <ReportHeader title={new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        report={report.loading ? null : report.data} fileName={`nails-by-leyah-sales-${value}.xlsx`}>
        <MonthPicker label="Month" value={value} onChange={setValue} align="end" />
        {value !== thisMonth && <Button variant="ghost" size="sm" onClick={() => setValue(thisMonth)}>This month</Button>}
      </ReportHeader>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && (
        <>
          <Totals report={report.data} previous={previous.loading ? null : previous.data} previousLabel={previousLabel}
            soFar={value === thisMonth ? 'This month so far' : null} />
          <DayChart days={report.data.days} />
        </>
      )}
      <ReportNotes />
    </Card>
  )
}

function ReportNotes() {
  return (
    <p className="muted small report-notes">Payments count on the day they were paid, refunds on the day they were sent; everything else on the day it happened.</p>
  )
}
