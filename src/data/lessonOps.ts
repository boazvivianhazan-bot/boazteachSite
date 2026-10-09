// Lesson writes that keep the sheet and Google Calendar in step.
// Calendar events are only ever changed if this app created them.
import { TIMEZONE } from '../config'
import { APP_MARK, createEvent, deleteOwnEvent, patchOwnEvent, type EventWrite } from '../lib/calendar'
import { toMin } from '../lib/time'
import { zonedRfc3339 } from '../lib/tz'
import type { Database } from './db'
import { invalidateEvents } from './events'
import { isLive, type Lesson, type LessonType, type Settings, type Student } from './schema'

export interface OpsCtx {
  db: Database
  settings: Settings
  students: Student[]
  lessonTypes: LessonType[]
}

const calOf = (l: Lesson, settings: Settings) => l.calendarId || settings.calendarId

/** "💻 זום – דנה" / "🏠 דנה – פרונטלי", plus " ×2" for double lessons. */
export function lessonTitle(name: string, isZoom: boolean, units: number) {
  const base = isZoom ? `💻 זום – ${name}` : `🏠 ${name} – פרונטלי`
  return units > 1 ? `${base} ×${units}` : base
}

function eventBody(l: Lesson, ctx: OpsCtx): EventWrite {
  const st = ctx.students.find((s) => s.id === l.studentId)
  const lt = ctx.lessonTypes.find((t) => t.id === l.lessonTypeId)
  const zoom = !!lt?.isZoom
  // Zoom: link in location and description. Frontal: address in location; building code, floor in description.
  const lines = zoom
    ? [st?.zoomLink ? `זום: ${st.zoomLink}` : '', st?.phone ? `טלפון: ${st.phone}` : '']
    : [
        st?.buildingCode ? `קוד בניין: ${st.buildingCode}` : '',
        st?.floorApt ? `קומה / דירה: ${st.floorApt}` : '',
        st?.phone ? `טלפון: ${st.phone}` : '',
      ]
  if (l.notes) lines.push(`הערות: ${l.notes}`)
  return {
    summary: lessonTitle(l.studentName, zoom, l.units),
    location: (zoom ? st?.zoomLink : st?.address) ?? '',
    description: lines.filter(Boolean).join('\n'),
    colorId: lt?.color,
    start: { dateTime: zonedRfc3339(l.date, toMin(l.start)), timeZone: TIMEZONE },
    end: { dateTime: zonedRfc3339(l.date, toMin(l.end)), timeZone: TIMEZONE },
    extendedProperties: { private: { [APP_MARK]: '1', lessonId: l.id } },
  }
}

/**
 * Saves new lessons. With `withCalendar`, each also gets a Calendar event; if
 * the sheet write then fails, the events just created are removed again.
 */
export async function createLessons(ctx: OpsCtx, lessons: Lesson[], withCalendar: boolean): Promise<Lesson[]> {
  const created: { cal: string; id: string }[] = []
  const out: Lesson[] = []
  try {
    for (let i = 0; i < lessons.length; i += 5) {
      const chunk = await Promise.all(
        lessons.slice(i, i + 5).map(async (l) => {
          if (!withCalendar) return { ...l, calendarEventId: '', calendarId: '' }
          const cal = ctx.settings.calendarId
          // A preset calendarEventId (weekly series) is used as the event's own id.
          const id = await createEvent(cal, eventBody(l, ctx), l.calendarEventId || undefined)
          created.push({ cal, id })
          return { ...l, calendarEventId: id, calendarId: cal }
        }),
      )
      out.push(...chunk)
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
 * Saves an edited lesson and syncs its Calendar event (time, length, color,
 * title). Returns a Hebrew note if the event could not be synced.
 */
export async function updateLesson(ctx: OpsCtx, next: Lesson, addToCalendar = false): Promise<string | null> {
  let l = { ...next }
  let note: string | null = null
  if (l.calendarEventId) {
    const own = await patchOwnEvent(calOf(l, ctx.settings), l.calendarEventId, eventBody(l, ctx))
    if (own === 'gone') {
      l = { ...l, calendarEventId: '', calendarId: '' }
      note = 'האירוע ביומן נמחק בינתיים — השיעור עודכן בגיליון בלבד.'
    } else if (own === 'foreign') {
      note = 'האירוע ביומן לא נוצר באפליקציה ולכן לא שונה.'
    }
  }
  if (!l.calendarEventId && addToCalendar) {
    const cal = ctx.settings.calendarId
    l = { ...l, calendarEventId: await createEvent(cal, eventBody(l, ctx)), calendarId: cal }
    note = null
  }
  await ctx.db.upsert('Lessons', [l])
  invalidateEvents()
  return note
}

/** Cancel = status "cancelled" (the row stays) + delete the app's Calendar event. */
export function cancelLesson(ctx: OpsCtx, l: Lesson) {
  return cancelLessons(ctx, [l])
}

/** Cancels many lessons: events deleted in parallel (5 at a time), then one sheet write. */
export async function cancelLessons(ctx: OpsCtx, list: Lesson[]) {
  const out: Lesson[] = []
  for (let i = 0; i < list.length; i += 5) {
    out.push(
      ...(await Promise.all(
        list.slice(i, i + 5).map(async (l) => {
          let keepEvent = ''
          if (l.calendarEventId) {
            const own = await deleteOwnEvent(calOf(l, ctx.settings), l.calendarEventId)
            if (own === 'foreign') keepEvent = l.calendarEventId
          }
          return { ...l, status: 'cancelled' as const, calendarEventId: keepEvent, calendarId: keepEvent ? l.calendarId : '' }
        }),
      )),
    )
  }
  await ctx.db.upsert('Lessons', out)
  invalidateEvents()
}

/** Postpone ("דחה") = status "postponed" + delete the app's event; not counted in income. */
export async function postponeLesson(ctx: OpsCtx, l: Lesson) {
  let keepEvent = ''
  if (l.calendarEventId) {
    const own = await deleteOwnEvent(calOf(l, ctx.settings), l.calendarEventId)
    if (own === 'foreign') keepEvent = l.calendarEventId
  }
  await ctx.db.upsert('Lessons', [{ ...l, status: 'postponed', calendarEventId: keepEvent, calendarId: keepEvent ? l.calendarId : '' }])
  invalidateEvents()
}

/** "השאר": remember these conflicts as accepted for this lesson. */
export function dismissConflicts(ctx: OpsCtx, l: Lesson, ids: string[]) {
  return ctx.db.upsert('Lessons', [{ ...l, dismissed: [...new Set([...l.dismissed, ...ids])] }])
}

/**
 * One-time fix: rewrite title / location / description of future lesson events
 * in the current format. Only events carrying the app's private marker change.
 * Returns how many events were updated.
 */
export async function refreshFutureLessonEvents(ctx: OpsCtx, lessons: Lesson[], todayIso: string) {
  const targets = lessons.filter((l) => isLive(l) && l.calendarEventId && l.date >= todayIso)
  let updated = 0
  for (let i = 0; i < targets.length; i += 5) {
    const results = await Promise.all(
      targets.slice(i, i + 5).map((l) => {
        const { summary, location, description, colorId } = eventBody(l, ctx)
        return patchOwnEvent(calOf(l, ctx.settings), l.calendarEventId, { summary, location, description, colorId })
      }),
    )
    updated += results.filter((r) => r === 'ours').length
  }
  if (updated) invalidateEvents()
  return updated
}

/** Status / paid changes touch only the sheet. */
export function setLessonFlags(ctx: OpsCtx, l: Lesson, patch: Partial<Pick<Lesson, 'status' | 'paid'>>) {
  return ctx.db.upsert('Lessons', [{ ...l, ...patch }])
}
