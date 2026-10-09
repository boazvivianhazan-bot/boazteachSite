// Weekly lessons ("שיעור קבוע"). A series row describes the rule; each week is
// its own Lessons row + Calendar event, kept filled HORIZON_DAYS ahead.
import { fromMin, toMin } from '../lib/time'
import { addDays, todayIso, weekdayOf } from '../lib/tz'
import { cancelLessons, createLessons, type OpsCtx } from './lessonOps'
import type { Lesson, Series } from './schema'

export const HORIZON_DAYS = 8 * 7

/**
 * Deterministic ids per series week: if two devices top up the same week at
 * the same moment they write the same sheet row and the same Calendar event.
 * Calendar event ids must be base32hex (0-9, a-v): our ids are hex, dates digits.
 */
const occurrenceId = (sr: Series, iso: string) => `ls_${sr.id.replace(/^sr_/, '')}_${iso.replace(/-/g, '')}`
const occurrenceEventId = (sr: Series, iso: string) => `lsn${sr.id.replace(/[^0-9a-f]/g, '')}${iso.replace(/-/g, '')}`

/** The series' weekly dates within [from, to]. */
export function seriesDates(sr: Series, from: string, to: string): string[] {
  const out: string[] = []
  const last = sr.endDate && sr.endDate < to ? sr.endDate : to
  let d = sr.startDate
  if (d < from) {
    const weeks = Math.ceil((Date.parse(from) - Date.parse(d)) / (7 * 86400000))
    d = addDays(d, weeks * 7)
  }
  for (; d <= last; d = addDays(d, 7)) out.push(d)
  return out
}

function occurrence(sr: Series, iso: string, ctx: OpsCtx): Lesson | null {
  const st = ctx.students.find((s) => s.id === sr.studentId)
  const lt = ctx.lessonTypes.find((t) => t.id === sr.lessonTypeId)
  if (!st || !lt) return null
  const start = toMin(sr.start)
  return {
    id: occurrenceId(sr, iso),
    date: iso,
    start: sr.start,
    end: fromMin(start + lt.durationMin * sr.units),
    studentId: st.id,
    studentName: st.name,
    lessonTypeId: lt.id,
    price: sr.unitPrice * sr.units,
    status: 'planned',
    paid: false,
    calendarEventId: occurrenceEventId(sr, iso),
    calendarId: '',
    notes: '',
    units: sr.units,
    seriesId: sr.id,
    seriesDate: iso,
    dismissed: [],
  }
}

/** Weeks of a series that still need a lesson (from today to the horizon). */
function missingWeeks(sr: Series, lessons: Lesson[], today: string) {
  // Any existing row for that week counts — including moved, cancelled or postponed ones.
  const have = new Set(lessons.filter((l) => l.seriesId === sr.id).map((l) => l.seriesDate || l.date))
  return seriesDates(sr, today, addDays(today, HORIZON_DAYS)).filter((d) => !have.has(d))
}

/** Creates a new weekly series starting with `first` and fills it up to the horizon. */
export async function createSeries(ctx: OpsCtx, first: Lesson, unitPrice: number, endDate: string) {
  const sr: Series = {
    id: `sr_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    studentId: first.studentId,
    weekday: weekdayOf(first.date),
    start: first.start,
    lessonTypeId: first.lessonTypeId,
    units: first.units,
    startDate: first.date,
    endDate,
    active: true,
    unitPrice,
  }
  await ctx.db.upsert('Series', [sr])
  const drafts = missingWeeks(sr, [], first.date < todayIso() ? first.date : todayIso())
    .map((iso) => occurrence(sr, iso, ctx))
    .filter((l): l is Lesson => !!l)
    .map((l) => ({ ...l, notes: first.notes }))
  return createLessons(ctx, drafts, true)
}

/** Fills every active series up to the horizon. Returns how many lessons were added. */
export async function topUpSeries(ctx: OpsCtx, series: Series[], lessons: Lesson[]) {
  const today = todayIso()
  const drafts = series
    .filter((sr) => sr.active && (!sr.endDate || sr.endDate >= today))
    .flatMap((sr) => missingWeeks(sr, lessons, today).map((iso) => occurrence(sr, iso, ctx)))
    .filter((l): l is Lesson => !!l)
  if (drafts.length) await createLessons(ctx, drafts, true)
  return drafts.length
}

/**
 * Ends a series from `fromIso` on: its planned lessons on/after that date are
 * cancelled (events deleted); earlier lessons stay as they are.
 */
export async function endSeries(ctx: OpsCtx, sr: Series, fromIso: string, lessons: Lesson[]) {
  await ctx.db.upsert('Series', [{ ...sr, active: false, endDate: addDays(fromIso, -1) }])
  const future = lessons.filter((l) => l.seriesId === sr.id && l.date >= fromIso && l.status === 'planned')
  await cancelLessons(ctx, future)
  return future.length
}
