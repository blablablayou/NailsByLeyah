// "Add to calendar" for an appointment: a small .ics file that Google Calendar, Apple Calendar and phone calendars open.
// Times are written in the salon's time zone (Asia/Manila, UTC+8 all year), so the appointment shows at the right hour
// wherever the client's phone is set.

import { salon } from '../content/salon'

const pad = (n) => String(n).padStart(2, '0')
// "2026-11-30" + "18:00:00" → "20261130T180000"
const local = (date, time) => `${date.replaceAll('-', '')}T${time.slice(0, 8).replaceAll(':', '')}`
// Commas, semicolons and backslashes are special in .ics text.
const text = (value) => String(value ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

function endTimeOf(booking) {
  if (booking.endTime) return booking.endTime
  const [h, m] = booking.startTime.split(':').map(Number)
  // The salon closes before midnight; an end past it stays on the same day rather than wrapping before the start.
  const minutes = Math.min(h * 60 + m + (booking.durationMinutes ?? 60), 23 * 60 + 59)
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`
}

// Lines longer than 75 bytes are folded: broken with CRLF and a leading space (RFC 5545), never inside a character.
const encoder = new TextEncoder()
function fold(line) {
  const parts = []
  let current = ''
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74 // a continuation line starts with a space
    if (encoder.encode(current + ch).length > limit) { parts.push(current); current = '' }
    current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** The .ics text for one booking (lines end in CRLF, as the format requires). */
export function buildIcs(booking, { now = new Date() } = {}) {
  const what = `${booking.serviceName}${booking.removalServiceName ? ` + Removal (${booking.removalServiceName})` : ''}`
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nails by Leyah//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Manila',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:PST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@nailsbyleyah`,
    `SEQUENCE:${booking.rescheduleCount ?? 0}`, // a rescheduled booking replaces the old event
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Manila:${local(booking.bookingDate, booking.startTime)}`,
    `DTEND;TZID=Asia/Manila:${local(booking.bookingDate, endTimeOf(booking))}`,
    `SUMMARY:${text(`Nails by Leyah: ${what}`)}`,
    `LOCATION:${text(salon.addressLines.join(', '))}`,
    `DESCRIPTION:${text(`Booking #${booking.id}. See My bookings for details or to reschedule.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}

/** Downloads the booking's .ics file. */
export function downloadIcs(booking) {
  const blob = new Blob([buildIcs(booking)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `nails-by-leyah-${booking.bookingDate}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
