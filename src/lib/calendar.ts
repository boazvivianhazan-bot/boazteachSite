import { TIMEZONE } from '../config'
import { ApiError, gfetch } from './api'

const CAL = 'https://www.googleapis.com/calendar/v3'

export interface CalendarListEntry {
  id: string
  summary: string
  summaryOverride?: string
  primary?: boolean
  selected?: boolean
  backgroundColor?: string
  foregroundColor?: string
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner'
}

let calendarList: Promise<CalendarListEntry[]> | null = null

/** Every calendar in the user's list (cached for the session). */
export function listCalendars(): Promise<CalendarListEntry[]> {
  if (!calendarList) {
    calendarList = gfetch<{ items: CalendarListEntry[] }>(`${CAL}/users/me/calendarList?minAccessRole=freeBusyReader`)
      .then((r) => r.items.sort((a, b) => Number(!!b.primary) - Number(!!a.primary)))
      .catch((e) => {
        calendarList = null
        throw e
      })
  }
  return calendarList
}

export const calendarName = (c: CalendarListEntry) => c.summaryOverride || c.summary

/** Shown unless turned off in Settings; by default follows Google Calendar's own checkbox. */
export function isCalendarShown(c: CalendarListEntry, visibility: Record<string, boolean>) {
  return visibility[c.id] ?? (!!c.selected || !!c.primary)
}

interface ApiEventTime {
  date?: string // all-day: yyyy-mm-dd
  dateTime?: string
}

export interface ApiEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start: ApiEventTime
  end: ApiEventTime
  transparency?: 'opaque' | 'transparent'
  htmlLink?: string
  attendees?: { self?: boolean; responseStatus?: string }[]
}

/** All event instances (recurring ones expanded) of one calendar between two instants. */
export async function listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<ApiEvent[]> {
  const out: ApiEvent[] = []
  let pageToken = ''
  do {
    const qs = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
      timeZone: TIMEZONE,
      fields: 'nextPageToken,items(id,status,summary,description,location,start,end,transparency,htmlLink,attendees(self,responseStatus))',
    })
    if (pageToken) qs.set('pageToken', pageToken)
    const r = await gfetch<{ items?: ApiEvent[]; nextPageToken?: string }>(
      `${CAL}/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
    )
    out.push(...(r.items ?? []))
    pageToken = r.nextPageToken ?? ''
  } while (pageToken)
  return out
}

// ---- writes: only ever applied to events this app created ------------------

/** Private marker on every event the app creates; edits/deletes require it. */
export const APP_MARK = 'lessonsApp'

export interface EventWrite {
  summary: string
  location?: string
  description?: string
  colorId?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties?: { private: Record<string, string> }
}

const evUrl = (calendarId: string, eventId = '') =>
  `${CAL}/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`

/**
 * Creates an event. With `id` (base32hex: 0-9 a-v), creating the same event
 * twice (e.g. from two devices) is harmless: "already exists" counts as done.
 */
export async function createEvent(calendarId: string, body: EventWrite, id?: string): Promise<string> {
  try {
    const r = await gfetch<{ id: string }>(evUrl(calendarId), { method: 'POST', body: JSON.stringify(id ? { ...body, id } : body) })
    return r.id
  } catch (e) {
    if (id && e instanceof ApiError && e.status === 409) return id
    throw e
  }
}

/**
 * Whether the event exists and was created by this app. Returns 'gone' for a
 * deleted event, 'foreign' for anything the app must not touch.
 */
export async function eventOwnership(calendarId: string, eventId: string): Promise<'ours' | 'foreign' | 'gone'> {
  try {
    const ev = await gfetch<{ status?: string; extendedProperties?: { private?: Record<string, string> } }>(
      `${evUrl(calendarId, eventId)}?fields=status,extendedProperties`,
    )
    if (ev.status === 'cancelled') return 'gone'
    return ev.extendedProperties?.private?.[APP_MARK] === '1' ? 'ours' : 'foreign'
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return 'gone'
    throw e
  }
}

/**
 * Updates an event only if this app created it. Returns what was found:
 * 'ours' (updated), 'gone' (nothing to update) or 'foreign' (left untouched).
 */
export async function patchOwnEvent(calendarId: string, eventId: string, body: Partial<EventWrite>) {
  const own = await eventOwnership(calendarId, eventId)
  if (own === 'ours') await gfetch(evUrl(calendarId, eventId), { method: 'PATCH', body: JSON.stringify(body) })
  return own
}

/** Deletes an event only if this app created it (same return values as patchOwnEvent). */
export async function deleteOwnEvent(calendarId: string, eventId: string) {
  const own = await eventOwnership(calendarId, eventId)
  if (own !== 'ours') return own
  try {
    await gfetch(evUrl(calendarId, eventId), { method: 'DELETE' })
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return 'gone' as const
    throw e
  }
  return own
}
