// Wall-clock helpers for Asia/Jerusalem, independent of the device's timezone.
// Dates are "yyyy-mm-dd" strings; times are minutes since local midnight.
import { TIMEZONE } from '../config'

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const pad = (n: number) => String(n).padStart(2, '0')

function parts(d: Date) {
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

/** Offset of Jerusalem from UTC at the given instant, in minutes (+120 / +180). */
function offsetMin(d: Date) {
  const p = parts(d)
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000) / 60000
}

/** Jerusalem wall-clock (date + minutes) → the real instant. */
export function zonedToUtc(iso: string, min: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, min)
  let t = guess - offsetMin(new Date(guess)) * 60000
  // Re-check once in case the guess crossed a DST switch.
  t = guess - offsetMin(new Date(t)) * 60000
  return new Date(t)
}

/** Instant → Jerusalem wall-clock date + minutes. */
export function utcToZoned(d: Date): { iso: string; min: number } {
  const p = parts(d)
  return { iso: `${p.y}-${pad(p.m)}-${pad(p.d)}`, min: p.h * 60 + p.mi }
}

export const todayIso = () => utcToZoned(new Date()).iso

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday */
export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** The Sunday that starts the week containing iso. */
export const weekStartOf = (iso: string) => addDays(iso, -weekdayOf(iso))

/** RFC 3339 timestamp with the Jerusalem offset, e.g. 2026-10-11T15:00:00+03:00 */
export function zonedRfc3339(iso: string, min: number) {
  const off = offsetMin(zonedToUtc(iso, min))
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${iso}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}
