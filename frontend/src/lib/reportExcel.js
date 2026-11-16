// The sales report as an Excel file (.xlsx), for Leyah's records, laid out like a printed Crystal Reports report: a
// report header band, column headings (repeated on every printed page), one detail row per day, a grand total, a
// summary band, and a page footer with page numbers. Built in the browser from the figures on the page.

export const totalReceived = (report) => report.depositsCollected + report.balancesReceived

/** What Leyah kept: everything received, less the refunds actually sent back in the same period. */
export const netReceived = (report) => totalReceived(report) - (report.refundsSent ?? 0)

const INK = 'FF000000'
const GREY_BAND = 'FFD9D9D9'
const GREY_LIGHT = 'FFF2F2F2'
const MUTED = 'FF595959'
const BURGUNDY = 'FF7A2E4C'
const PESO = '#,##0.00'
const COUNT = '#,##0'
const FONT = 'Arial'

const thin = { style: 'thin', color: { argb: INK } }
const double = { style: 'double', color: { argb: INK } }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

/** "Tue, Nov 3" for a yyyy-mm-dd date. */
const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

const hasActivity = (d) => d.bookingsMade || d.bookingsCompleted || d.bookingsCancelled || d.bookingsNoShow || d.depositsCollected || d.balancesReceived || d.refundsSent

const COLUMNS = [
  { header: 'Date', key: 'date', width: 16 },
  { header: 'Made', key: 'bookingsMade', width: 9, format: COUNT },
  { header: 'Completed', key: 'bookingsCompleted', width: 12, format: COUNT },
  { header: 'Cancelled', key: 'bookingsCancelled', width: 12, format: COUNT },
  { header: 'No-show', key: 'bookingsNoShow', width: 10, format: COUNT },
  { header: 'Paid online', key: 'depositsCollected', width: 15, format: PESO },
  { header: 'Balances received', key: 'balancesReceived', width: 19, format: PESO },
  { header: 'Total received', key: 'total', width: 17, format: PESO },
  { header: 'Refunds sent', key: 'refundsSent', width: 15, format: PESO },
  { header: 'Net received', key: 'net', width: 16, format: PESO },
]
const LAST = COLUMNS.length // column J
// What each column adds up to for one day, for the cached results Excel shows before it recalculates.
const amountOf = (d, key) => (key === 'total' ? totalReceived(d) : key === 'net' ? netReceived(d) : d[key] ?? 0)

/**
 * Builds the workbook. `period` is the report's title, e.g. "November 2026" or "Fri, Nov 13, 2026". A monthly report
 * lists every day with activity; a daily report has one detail row for its day (`report.date`).
 */
export function buildSalesReportWorkbook(ExcelJS, { period, report, generatedAt = new Date() }) {
  const book = new ExcelJS.Workbook()
  book.creator = 'Nails by Leyah'
  book.created = generatedAt
  // Excel works out every formula (the row and grand totals) when the file opens.
  book.calcProperties.fullCalcOnLoad = true

  const sheet = book.addWorksheet('Sales Report', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } },
  })
  sheet.columns = COLUMNS.map(({ key, width }) => ({ key, width }))
  const font = (extra = {}) => ({ name: FONT, size: 10, color: { argb: INK }, ...extra })

  // ---- Report header band ----
  sheet.mergeCells(1, 1, 1, 5)
  sheet.getCell('A1').value = 'NAILS BY LEYAH'
  sheet.getCell('A1').font = font({ size: 16, bold: true, color: { argb: BURGUNDY } })
  sheet.mergeCells(1, 6, 1, LAST)
  sheet.getCell(1, 6).value = `Printed: ${generatedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
  sheet.getCell(1, 6).font = font({ size: 9, color: { argb: MUTED } })
  sheet.getCell(1, 6).alignment = { horizontal: 'right', vertical: 'middle' }
  sheet.getRow(1).height = 24
  sheet.mergeCells(2, 1, 2, LAST)
  sheet.getCell('A2').value = 'Sales Report'
  sheet.getCell('A2').font = font({ size: 13, bold: true })
  sheet.mergeCells(3, 1, 3, LAST)
  sheet.getCell('A3').value = `Period: ${period}`
  sheet.getCell('A3').font = font({ color: { argb: MUTED } })
  for (let c = 1; c <= LAST; c += 1) sheet.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: INK } } }

  // ---- Column headings (page header), repeated on every printed page ----
  const head = 5
  const headRow = sheet.getRow(head)
  COLUMNS.forEach((col, i) => {
    const cell = headRow.getCell(i + 1)
    cell.value = col.header
    cell.font = font({ bold: true })
    cell.fill = fill(GREY_BAND)
    cell.border = { top: thin, bottom: thin }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', wrapText: true }
  })
  headRow.height = 20
  sheet.pageSetup.printTitlesRow = `${head}:${head}`
  sheet.views = [{ state: 'frozen', ySplit: head, showGridLines: false }]

  // ---- Details ----
  const rows = report.days ? report.days.filter(hasActivity) : [{ ...report, date: report.date }]
  let r = head + 1
  if (rows.length === 0 || (!report.days && !hasActivity(report))) {
    sheet.mergeCells(r, 1, r, LAST)
    sheet.getCell(r, 1).value = 'No activity in this period.'
    sheet.getCell(r, 1).font = font({ italic: true, color: { argb: MUTED } })
    r += 1
  } else {
    const first = r
    rows.forEach((d, i) => {
      const row = sheet.getRow(r)
      row.values = [d.date ? dayLabel(d.date) : period, d.bookingsMade, d.bookingsCompleted, d.bookingsCancelled, d.bookingsNoShow,
        d.depositsCollected, d.balancesReceived, { formula: `F${r}+G${r}`, result: totalReceived(d) },
        d.refundsSent ?? 0, { formula: `H${r}-I${r}`, result: netReceived(d) }]
      COLUMNS.forEach((col, c) => {
        const cell = row.getCell(c + 1)
        cell.font = font()
        if (col.format) cell.numFmt = col.format
        cell.alignment = { horizontal: c === 0 ? 'left' : 'right' }
        if (i % 2) cell.fill = fill(GREY_LIGHT)
      })
      r += 1
    })

    // ---- Grand total (report footer): adds up the rows above, so the sheet stays right if Leyah edits a figure ----
    const last = r - 1
    const total = sheet.getRow(r)
    total.values = ['Grand Total', ...COLUMNS.slice(1).map((col, i) => {
      const letter = String.fromCharCode(66 + i) // B, C, ...
      return { formula: `SUM(${letter}${first}:${letter}${last})`,
        result: rows.reduce((sum, d) => sum + amountOf(d, col.key), 0) }
    })]
    COLUMNS.forEach((col, c) => {
      const cell = total.getCell(c + 1)
      cell.font = font({ bold: true })
      if (col.format) cell.numFmt = col.format
      cell.alignment = { horizontal: c === 0 ? 'left' : 'right' }
      cell.border = { top: thin, bottom: double }
    })
    r += 1
  }

  // ---- Summary band ----
  r += 1
  sheet.mergeCells(r, 1, r, LAST)
  sheet.getCell(r, 1).value = 'Summary'
  sheet.getCell(r, 1).font = font({ bold: true })
  sheet.getCell(r, 1).fill = fill(GREY_BAND)
  sheet.getCell(r, 1).border = { top: thin, bottom: thin }
  r += 1
  const line = (label, value, format, { strong = false, note } = {}) => {
    sheet.mergeCells(r, 2, r, LAST - 1)
    sheet.getCell(r, 1).value = label
    sheet.getCell(r, 1).font = font({ bold: strong })
    sheet.getCell(r, 2).value = note ?? null
    sheet.getCell(r, 2).font = font({ italic: true, size: 9, color: { argb: MUTED } })
    const cell = sheet.getCell(r, LAST)
    cell.value = value
    cell.numFmt = format
    cell.font = font({ bold: strong })
    cell.alignment = { horizontal: 'right' }
    r += 1
  }
  line('Net received', netReceived(report), PESO, { strong: true, note: 'total received, less the refunds sent' })
  line('Total received', totalReceived(report), PESO, { note: 'online payments plus balances' })
  line('Refunds sent', report.refundsSent ?? 0, PESO, { note: 'sent back to clients' })
  line('Paid online', report.depositsCollected, PESO, { note: 'deposits and full payments' })
  line('Balances received', report.balancesReceived, PESO, { note: 'paid after the service' })
  line('Completed services', report.completedServicesValue, PESO, { note: 'full price of appointments completed' })
  line('Balances unpaid', report.balancesUnpaid, PESO, { note: 'completed, not recorded yet' })
  line('Bookings made', report.bookingsMade, COUNT, { note: 'new bookings placed' })
  line('Completed', report.bookingsCompleted, COUNT, { note: 'appointments finished' })
  line('Cancelled', report.bookingsCancelled, COUNT, { note: 'by clients or the salon' })
  line('No-show', report.bookingsNoShow, COUNT, { note: 'client did not come' })
  for (let c = 1; c <= LAST; c += 1) sheet.getCell(r - 1, c).border = { bottom: thin }

  r += 1
  sheet.mergeCells(r, 1, r, LAST)
  sheet.getCell(r, 1).value = "Amounts in Philippine pesos (PHP). For the salon's records; this is not an official receipt."
  sheet.getCell(r, 1).font = font({ italic: true, size: 9, color: { argb: MUTED } })
  if (report.days) {
    r += 1
    sheet.mergeCells(r, 1, r, LAST)
    sheet.getCell(r, 1).value = 'Days with no activity are not listed.'
    sheet.getCell(r, 1).font = font({ italic: true, size: 9, color: { argb: MUTED } })
  }

  // ---- Page footer (printed): the note and the page numbers ----
  sheet.headerFooter.oddFooter = '&L&"Arial,Italic"&8Payments count on the day they were paid, refunds on the day they were sent; everything else on the day it happened.&R&"Arial"&8Page &P of &N'
  sheet.headerFooter.evenFooter = sheet.headerFooter.oddFooter
  return book
}

/** Builds the file and hands it to the browser to save. */
export async function downloadSalesReport({ period, report, fileName }) {
  const ExcelJS = (await import('exceljs')).default
  const buffer = await buildSalesReportWorkbook(ExcelJS, { period, report }).xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
