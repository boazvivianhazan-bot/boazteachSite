// Google Calendar events of every shown calendar, split per Jerusalem day and
// cached in memory for the session. Read-only: nothing here modifies events.
import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../lib/api'
import { calendarName, isCalendarShown, listCalendars, listEvents, type ApiEvent } from '../lib/calendar'
import type { Iv } from '../lib/slots'
import { addDays, utcToZoned, zonedToUtc } from '../lib/tz'

export interface CalEvent {
  id: string
  calendarId: string
  calendarName: string
  color: string
  title: string
  location: string
  description: string
  allDay: boolean
  /** All-day: first and last date (inclusive). Timed: wall-clock of start/end. */
  startIso: string
  endIso: string
  startMin: number // timed only
  endMin: number // timed only (may be on a later day)
  transparent: boolean // "free" in Google Calendar → does not block suggestions
  htmlLink?: string
}

/** One day's piece of a timed event (events past midnight are split). */
export interface DayPiece {
  event: CalEvent
  start: number
  end: number
}

export interface DayEvents {
  allDay: CalEvent[]
  timed: DayPiece[]
  busy: Iv[] // opaque timed events, for the green suggestions
}

export type EventsByDay = Record<string, DayEvents>
export type BusyByDay = Record<string, Iv[]>

const cache = new Map<string, Promise<{ days: EventsByDay; failed: string[] }>>()
const listeners = new Set<() => void>()

/** Drop cached events (e.g. after booking or cancelling a lesson). */
export function invalidateEvents() {
  cache.clear()
  listeners.forEach((l) => l())
}

function toCalEvent(e: ApiEvent, calendarId: string, calName: string, color: string): CalEvent | null {
  if (e.status === 'cancelled') return null
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null
  const base = {
    id: e.id,
    calendarId,
    calendarName: calName,
    color,
    title: e.summary?.trim() || '(ללא כותרת)',
    location: e.location ?? '',
    description: e.description ?? '',
    transparent: e.transparency === 'transparent',
    htmlLink: e.htmlLink,
  }
  if (e.start.date) {
    // All-day: Google's end date is exclusive.
    const endIso = addDays(e.end.date ?? e.start.date, -1)
    return { ...base, allDay: true, startIso: e.start.date, endIso: endIso < e.start.date ? e.start.date : endIso, startMin: 0, endMin: 0 }
  }
  if (!e.start.dateTime || !e.end.dateTime) return null
  const s = utcToZoned(new Date(e.start.dateTime))
  const en = utcToZoned(new Date(e.end.dateTime))
  return { ...base, allDay: false, startIso: s.iso, endIso: en.iso, startMin: s.min, endMin: en.min }
}

function place(days: EventsByDay, ev: CalEvent) {
  const day = (iso: string) => days[iso]
  if (ev.allDay) {
    // All-day events are "free" by default in Google Calendar; one marked busy (e.g. vacation) blocks the day.
    for (let iso = ev.startIso; iso <= ev.endIso; iso = addDays(iso, 1)) {
      day(iso)?.allDay.push(ev)
      if (!ev.transparent) day(iso)?.busy.push([0, 24 * 60])
    }
    return
  }
  // Split timed events across midnight.
  let iso = ev.startIso
  let start = ev.startMin
  while (iso <= ev.endIso) {
    const last = iso === ev.endIso
    const end = last ? ev.endMin : 24 * 60
    if (end > start || (last && iso === ev.startIso && end === start)) {
      const d = day(iso)
      if (d) {
        d.timed.push({ event: ev, start, end: Math.max(end, start) })
        if (!ev.transparent && end > start) d.busy.push([start, end])
      }
    }
    iso = addDays(iso, 1)
    start = 0
  }
}

async function load(startIso: string, days: number, visibility: Record<string, boolean>, lessonsCalendarId: string) {
  const all = await listCalendars()
  const shown = all.filter((c) => isCalendarShown(c, visibility) || c.id === lessonsCalendarId || (lessonsCalendarId === 'primary' && c.primary))
  const timeMin = zonedToUtc(startIso, 0)
  const timeMax = zonedToUtc(addDays(startIso, days), 0)
  const out: EventsByDay = {}
  for (let i = 0; i < days; i++) out[addDays(startIso, i)] = { allDay: [], timed: [], busy: [] }
  const failed: string[] = []
  const results = await Promise.allSettled(shown.map((c) => listEvents(c.id, timeMin, timeMax)))
  results.forEach((r, i) => {
    const c = shown[i]
    if (r.status === 'rejected') {
      // A calendar shared as free/busy only cannot be listed — report, don't fail the view.
      failed.push(calendarName(c))
      return
    }
    for (const e of r.value) {
      const ev = toCalEvent(e, c.id, calendarName(c), c.backgroundColor ?? '#64748b')
      if (ev) place(out, ev)
    }
  })
  // If every calendar failed (e.g. token expired), surface the real error.
  if (shown.length && failed.length === shown.length) {
    const firstErr = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    throw firstErr.reason
  }
  for (const d of Object.values(out)) d.timed.sort((a, b) => a.start - b.start || b.end - a.end)
  return { days: out, failed }
}

/** Events for any date range (cached), e.g. to check a manual booking for overlaps. */
export function cachedLoad(startIso: string, days: number, visibility: Record<string, boolean>, lessonsCalendarId: string) {
  const key = `${startIso}|${days}|${lessonsCalendarId}|${JSON.stringify(visibility)}`
  let p = cache.get(key)
  if (!p) {
    p = load(startIso, days, visibility, lessonsCalendarId)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function busyOf(days: EventsByDay): BusyByDay {
  return Object.fromEntries(Object.entries(days).map(([iso, d]) => [iso, d.busy]))
}

export function useEvents(startIso: string, days: number, visibility: Record<string, boolean>, lessonsCalendarId: string) {
  const [data, setData] = useState<{ days: EventsByDay; failed: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const visKey = JSON.stringify(visibility)

  useEffect(() => {
    const l = () => setVersion((v) => v + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    cachedLoad(startIso, days, JSON.parse(visKey), lessonsCalendarId).then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(errorText(e)),
    )
    return () => {
      cancelled = true
    }
  }, [startIso, days, visKey, lessonsCalendarId, version])

  // Clear stale data when the range changes (but keep it while refreshing the same range).
  const [shownKey, setShownKey] = useState(`${startIso}|${days}`)
  if (shownKey !== `${startIso}|${days}`) {
    setShownKey(`${startIso}|${days}`)
    setData(null)
  }

  const refresh = useCallback(() => invalidateEvents(), [])
  return { data, error, refresh }
}
