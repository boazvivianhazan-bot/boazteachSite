// Lesson writes that keep the sheet and Google Calendar in step.
// Calendar events are only ever changed if this app created them.
//
// Group lessons: every student has their own Lessons row (own price, own
// balance), and the rows share a groupId and ONE calendar event. That event is
// always rebuilt from all the live rows that point at it — so cancelling one
// student rewrites the event, and cancelling the last one deletes it.
import { TIMEZONE } from '../config'
import { APP_MARK, createEvent, deleteOwnEvent, patchOwnEvent, type EventWrite } from '../lib/calendar'
import { toMin } from '../lib/time'
import { zonedRfc3339 } from '../lib/tz'
import type { Database } from './db'
import { invalidateEvents } from './events'
import { isLive, type Lesson, type LessonStatus, type LessonType, type Settings, type Student } from './schema'

export interface OpsCtx {
  db: Database
  settings: Settings
  students: Student[]
  lessonTypes: LessonType[]
}

const calOf = (l: Lesson, settings: Settings) => l.calendarId || settings.calendarId
const firstName = (name: string) => name.trim().split(/\s+/)[0]

/** "💻 זום – דנה" / "🏠 דנה – פרונטלי", plus " ×2" for double lessons. */
export function lessonTitle(name: string, isZoom: boolean, units: number) {
  const base = isZoom ? `💻 זום – ${name}` : `🏠 ${name} – פרונטלי`
  return units > 1 ? `${base} ×${units}` : base
}

/** "🏠 קבוצה – נועה, דנה (2)" / "💻 זום קבוצה – …", plus " ×2". */
export function groupTitle(names: string[], isZoom: boolean, units: number) {
  const base = `${isZoom ? '💻 זום קבוצה' : '🏠 קבוצה'} – ${names.map(firstName).join(', ')} (${names.length})`
  return units > 1 ? `${base} ×${units}` : base
}

/** The calendar event for one lesson, or for all live rows of a group lesson. */
export function eventBodyFor(rows: Lesson[], ctx: OpsCtx): EventWrite {
  const l = rows[0]
  const lt = ctx.lessonTypes.find((t) => t.id === l.lessonTypeId)
  const zoom = !!lt?.isZoom
  const members = rows.map((r) => ({ row: r, st: ctx.students.find((s) => s.id === r.studentId) }))
  const lead = members.find((m) => (zoom ? m.st?.zoomLink : m.st?.address))?.st ?? members[0].st
  const lines: string[] = []
  if (rows.length === 1) {
    const st = members[0].st
    // Zoom: link in location and description. Frontal: address in location; building code, floor in description.
    if (zoom) lines.push(st?.zoomLink ? `זום: ${st.zoomLink}` : '', st?.phone ? `טלפון: ${st.phone}` : '')
    else
      lines.push(
        st?.buildingCode ? `קוד בניין: ${st.buildingCode}` : '',
        st?.floorApt ? `קומה / דירה: ${st.floorApt}` : '',
        st?.phone ? `טלפון: ${st.phone}` : '',
      )
  } else {
    if (zoom && lead?.zoomLink) lines.push(`זום: ${lead.zoomLink}`)
    if (!zoom && lead?.buildingCode) lines.push(`קוד בניין: ${lead.buildingCode}`)
    if (!zoom && lead?.floorApt) lines.push(`קומה / דירה: ${lead.floorApt}`)
    lines.push('תלמידים:', ...members.map((m) => `• ${m.row.studentName}${m.st?.phone ? ` – ${m.st.phone}` : ''}`))
  }
  const notes = [...new Set(rows.map((r) => r.notes).filter(Boolean))]
  if (notes.length) lines.push(`הערות: ${notes.join(' · ')}`)
  return {
    summary: rows.length === 1 ? lessonTitle(l.studentName, zoom, l.units) : groupTitle(rows.map((r) => r.studentName), zoom, l.units),
    location: (zoom ? lead?.zoomLink : lead?.address) ?? '',
    description: lines.filter(Boolean).join('\n'),
    colorId: lt?.color,
    start: { dateTime: zonedRfc3339(l.date, toMin(l.start)), timeZone: TIMEZONE },
    end: { dateTime: zonedRfc3339(l.date, toMin(l.end)), timeZone: TIMEZONE },
    extendedProperties: { private: { [APP_MARK]: '1', lessonId: l.id, ...(l.groupId ? { groupId: l.groupId } : {}) } },
  }
}

/** Live rows of a group lesson (or just the lesson itself when it isn't a group). */
export function groupRowsOf(l: Lesson, lessons: Lesson[]) {
  if (!l.groupId) return [l]
  return lessons.filter((x) => x.groupId === l.groupId && isLive(x))
}

/** Lessons after applying `changed` rows (matched by id) to the current list. */
function merged(all: Lesson[], changed: Lesson[]) {
  const byId = new Map(changed.map((l) => [l.id, l]))
  const out = all.map((l) => byId.get(l.id) ?? l)
  for (const l of changed) if (!all.some((x) => x.id === l.id)) out.push(l)
  return out
}

/**
 * Brings the given events in line with the lessons as they will be: patch with
 * the rows still pointing at each event, or delete it when none are left.
 */
async function syncEvents(ctx: OpsCtx, eventIds: { cal: string; id: string }[], after: Lesson[]) {
  const result = new Map<string, 'ours' | 'foreign' | 'gone'>()
  const unique = [...new Map(eventIds.filter((e) => e.id).map((e) => [e.id, e])).values()]
  for (let i = 0; i < unique.length; i += 5) {
    await Promise.all(
      unique.slice(i, i + 5).map(async ({ cal, id }) => {
        const rows = after.filter((l) => isLive(l) && l.calendarEventId === id)
        result.set(id, rows.length ? await patchOwnEvent(cal, id, eventBodyFor(rows, ctx)) : await deleteOwnEvent(cal, id))
      }),
    )
  }
  return result
}

/**
 * Saves new lessons. With `withCalendar`, each lesson — or each group (rows
 * sharing a groupId) — gets ONE Calendar event. If the sheet write then fails,
 * the events just created are removed again.
 */
export async function createLessons(ctx: OpsCtx, lessons: Lesson[], withCalendar: boolean): Promise<Lesson[]> {
  const created: { cal: string; id: string }[] = []
  const buckets = new Map<string, Lesson[]>()
  for (const l of lessons) buckets.set(l.groupId || l.id, [...(buckets.get(l.groupId || l.id) ?? []), l])
  const out: Lesson[] = []
  try {
    const list = [...buckets.values()]
    for (let i = 0; i < list.length; i += 5) {
      const chunk = await Promise.all(
        list.slice(i, i + 5).map(async (rows) => {
          if (!withCalendar) return rows.map((l) => ({ ...l, calendarEventId: '', calendarId: '' }))
          const cal = ctx.settings.calendarId
          // A preset calendarEventId (weekly series) is used as the event's own id.
          const id = await createEvent(cal, eventBodyFor(rows, ctx), rows[0].calendarEventId || undefined)
          created.push({ cal, id })
          return rows.map((l) => ({ ...l, calendarEventId: id, calendarId: cal }))
        }),
      )
      out.push(...chunk.flat())
    }
    await ctx.db.upsert('Lessons', out)
  } catch (e) {
    await Promise.all(created.map((c) => deleteOwnEvent(c.cal, c.id).catch(() => {})))
    throw e
  } finally {
    if (created.length) invalidateEvents()
  }
  return out
}

/**
 * Saves edited lessons (one lesson, or every row of a group) and syncs their
 * Calendar events. `addToCalendar` creates an event for rows that have none.
 * Returns a Hebrew note if an event could not be synced.
 */
export async function updateLessons(ctx: OpsCtx, rows: Lesson[], addToCalendar = false): Promise<string | null> {
  const before = ctx.db.snapshot.lessons
  let next = rows.map((l) => ({ ...l }))
  let note: string | null = null
  const touched = [...rows, ...rows.map((r) => before.find((b) => b.id === r.id)).filter((x): x is Lesson => !!x)]
    .filter((l) => l.calendarEventId)
    .map((l) => ({ cal: calOf(l, ctx.settings), id: l.calendarEventId }))
  const res = await syncEvents(ctx, touched, merged(before, next))
  for (const [id, own] of res) {
    if (own === 'gone') {
      next = next.map((l) => (l.calendarEventId === id ? { ...l, calendarEventId: '', calendarId: '' } : l))
      note = 'האירוע ביומן נמחק בינתיים — השיעור עודכן בגיליון בלבד.'
    } else if (own === 'foreign') note = 'האירוע ביומן לא נוצר באפליקציה ולכן לא שונה.'
  }
  if (addToCalendar) {
    const missing = next.filter((l) => !l.calendarEventId && isLive(l))
    if (missing.length) {
      const cal = ctx.settings.calendarId
      const id = await createEvent(cal, eventBodyFor(missing, ctx))
      next = next.map((l) => (missing.includes(l) ? { ...l, calendarEventId: id, calendarId: cal } : l))
      note = null
    }
  }
  await ctx.db.upsert('Lessons', next)
  invalidateEvents()
  return note
}

export const updateLesson = (ctx: OpsCtx, next: Lesson, addToCalendar = false) => updateLessons(ctx, [next], addToCalendar)

/**
 * Cancel / postpone lessons. Each row leaves its event; the event is deleted
 * only when no live row is left on it (so cancelling one student of a group
 * keeps the lesson for the others, with an updated title).
 */
export async function withdrawLessons(ctx: OpsCtx, list: Lesson[], status: Extract<LessonStatus, 'cancelled' | 'postponed'>) {
  const before = ctx.db.snapshot.lessons
  const withdrawn = list.map((l) => ({ ...l, status }))
  const res = await syncEvents(
    ctx,
    list.filter((l) => l.calendarEventId).map((l) => ({ cal: calOf(l, ctx.settings), id: l.calendarEventId })),
    merged(before, withdrawn),
  )
  // Rows leave their event, unless it isn't ours (then it's left exactly as it was).
  const out = withdrawn.map((l) =>
    l.calendarEventId && res.get(l.calendarEventId) === 'foreign' ? l : { ...l, calendarEventId: '', calendarId: '' },
  )
  await ctx.db.upsert('Lessons', out)
  invalidateEvents()
}

/** Cancel = status "cancelled" (the row stays) + the app's event is updated or deleted. */
export const cancelLesson = (ctx: OpsCtx, l: Lesson) => withdrawLessons(ctx, [l], 'cancelled')
export const cancelLessons = (ctx: OpsCtx, list: Lesson[]) => withdrawLessons(ctx, list, 'cancelled')

/** Postpone ("דחה") = status "postponed", same calendar handling; not counted in income. */
export const postponeLesson = (ctx: OpsCtx, l: Lesson) => withdrawLessons(ctx, [l], 'postponed')
export const postponeLessons = (ctx: OpsCtx, list: Lesson[]) => withdrawLessons(ctx, list, 'postponed')

/** "השאר": remember these conflicts as accepted for these lessons. */
export function dismissConflicts(ctx: OpsCtx, l: Lesson | Lesson[], ids: string[]) {
  const rows = Array.isArray(l) ? l : [l]
  return ctx.db.upsert('Lessons', rows.map((r) => ({ ...r, dismissed: [...new Set([...r.dismissed, ...ids])] })))
}

/**
 * One-time fix: rewrite title / location / description of future lesson events
 * in the current format. Only events carrying the app's private marker change.
 * Returns how many events were updated.
 */
export async function refreshFutureLessonEvents(ctx: OpsCtx, lessons: Lesson[], todayIso: string) {
  const byEvent = new Map<string, Lesson[]>()
  for (const l of lessons)
    if (isLive(l) && l.calendarEventId && l.date >= todayIso) byEvent.set(l.calendarEventId, [...(byEvent.get(l.calendarEventId) ?? []), l])
  const groups = [...byEvent.values()]
  let updated = 0
  for (let i = 0; i < groups.length; i += 5) {
    const results = await Promise.all(
      groups.slice(i, i + 5).map((rows) => {
        const { summary, location, description, colorId } = eventBodyFor(rows, ctx)
        return patchOwnEvent(calOf(rows[0], ctx.settings), rows[0].calendarEventId, { summary, location, description, colorId })
      }),
    )
    updated += results.filter((r) => r === 'ours').length
  }
  if (updated) invalidateEvents()
  return updated
}

/** Status / paid changes touch only the sheet. */
export function setLessonFlags(ctx: OpsCtx, l: Lesson | Lesson[], patch: Partial<Pick<Lesson, 'status' | 'paid'>>) {
  const rows = Array.isArray(l) ? l : [l]
  return ctx.db.upsert('Lessons', rows.map((r) => ({ ...r, ...patch })))
}
