// Conflict check for upcoming lessons, run whenever the app is open: overlaps
// with calendar events (highlight rules use their own minutes before/after)
// and Israeli holidays / holiday eves. Dismissed ("השאר") conflicts are skipped.
import { useEffect, useMemo, useState } from 'react'
import { EVE_FROM_MIN, getHolidays, type Holidays } from '../lib/holidays'
import { fromMin, toMin } from '../lib/time'
import { addDays, utcToZoned } from '../lib/tz'
import { useDb } from './db'
import { useEvents, type EventsByDay } from './events'
import { isLive, matchRule, type Lesson, type Settings } from './schema'

export const CHECK_DAYS = 28

export interface ConflictReason {
  id: string // stable id, stored in Lesson.dismissed when kept
  text: string
}

export interface LessonConflict {
  lesson: Lesson
  reasons: ConflictReason[]
}

export function findLessonConflicts(
  lessons: Lesson[],
  events: EventsByDay,
  holidays: Holidays['days'],
  settings: Settings,
  now: { iso: string; min: number },
): LessonConflict[] {
  const lessonEventIds = new Set(lessons.filter(isLive).map((l) => l.calendarEventId).filter(Boolean))
  const last = addDays(now.iso, CHECK_DAYS - 1)
  const out: LessonConflict[] = []

  for (const l of lessons) {
    if (l.status !== 'planned' || !l.start || !l.end || l.date < now.iso || l.date > last) continue
    const s = toMin(l.start)
    const e = toMin(l.end)
    if (l.date === now.iso && e <= now.min) continue
    const reasons: ConflictReason[] = []
    const day = events[l.date]

    for (const p of day?.timed ?? []) {
      if (lessonEventIds.has(p.event.id)) continue
      const rule = matchRule(p.event.title, settings.highlightRules)
      const pad = rule?.important ? rule.windowMin : 0
      if (p.start - pad < e && s < p.end + pad) {
        const what = rule ? `${rule.label || rule.keyword}: ${p.event.title}` : p.event.title
        const overlap = p.start < e && s < p.end
        reasons.push({
          id: `ev:${p.event.id}`,
          text: `${overlap ? 'חופף ל' : 'קרוב ל'}${what} (${fromMin(p.start)}-${fromMin(p.end)})`,
        })
      }
    }
    for (const ev of day?.allDay ?? []) {
      if (!ev.transparent) reasons.push({ id: `ev:${ev.id}`, text: `חופף ל${ev.title} (כל היום)` })
    }
    const h = holidays[l.date]
    if (h?.kind === 'holiday') reasons.push({ id: `hol:${l.date}`, text: `חג: ${h.name}` })
    if (h?.kind === 'eve' && e > EVE_FROM_MIN) reasons.push({ id: `hol:${l.date}`, text: `${h.name} (מ-13:00)` })

    const open = reasons.filter((r) => !l.dismissed.includes(r.id))
    if (open.length) out.push({ lesson: l, reasons: open })
  }
  return out.sort((a, b) => (a.lesson.date + a.lesson.start).localeCompare(b.lesson.date + b.lesson.start))
}

/** Live conflict list for the next CHECK_DAYS days; recomputes when lessons or events change. */
export function useConflicts() {
  const { lessons, settings } = useDb()
  const today = utcToZoned(new Date()).iso
  const events = useEvents(today, CHECK_DAYS, settings.calendarVisibility, settings.calendarId)
  const [holidays, setHolidays] = useState<Holidays | null>(null)
  const [holidayError, setHolidayError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHolidays(today, addDays(today, CHECK_DAYS)).then(
      (h) => !cancelled && setHolidays(h),
      () => !cancelled && setHolidayError(true),
    )
    return () => {
      cancelled = true
    }
  }, [today])

  const conflicts = useMemo(() => {
    if (!events.data) return null
    return findLessonConflicts(lessons, events.data.days, holidays?.days ?? {}, settings, utcToZoned(new Date()))
  }, [events.data, holidays, lessons, settings])

  return { conflicts, holidaySource: holidays?.source ?? null, holidayError }
}
