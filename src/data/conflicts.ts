// Warnings for a proposed lesson time. They never block saving.
import { fromMin, toMin } from '../lib/time'
import { weekdayOf } from '../lib/tz'
import type { EventsByDay } from './events'
import { placeKey } from './plan'
import { isLive, matchRule, type Lesson, type LessonType, type Settings, type Student } from './schema'

export interface Warning {
  kind: 'overlap' | 'break' | 'hours' | 'rule'
  text: string
}

interface Args {
  iso: string
  start: number
  end: number
  place: string | null // where the new lesson happens (placeKey)
  events: EventsByDay | null
  lessons: Lesson[]
  students: Student[]
  lessonTypes: LessonType[]
  settings: Settings
  ignoreLessonId?: string // the lesson being edited
  noBreakCheck?: boolean // "+ שיעור צמוד": back-to-back on purpose
}

export function findWarnings(a: Args): Warning[] {
  const out: Warning[] = []
  const buf = a.settings.bufferMin
  const day = a.events?.[a.iso]
  const lessonEventIds = new Set(a.lessons.filter(isLive).map((l) => l.calendarEventId).filter(Boolean))
  const ignoreEvent = a.lessons.find((l) => l.id === a.ignoreLessonId)?.calendarEventId

  // Things on that day: calendar events (lesson events are covered by the lessons) + sheet lessons.
  const items: { title: string; start: number; end: number; place: string | null; blocksBreak: boolean }[] = []
  const important = a.settings.highlightRules.filter((r) => r.important)
  for (const p of day?.timed ?? []) {
    if (lessonEventIds.has(p.event.id) || p.event.id === ignoreEvent) continue
    if (matchRule(p.event.title, important)) continue // reported by its rule below
    items.push({ title: p.event.title, start: p.start, end: p.end, place: null, blocksBreak: !p.event.transparent })
  }
  for (const ev of day?.allDay ?? []) {
    if (!ev.transparent) out.push({ kind: 'overlap', text: `חופף ל: ${ev.title} (כל היום)` })
  }
  for (const l of a.lessons) {
    if (l.date !== a.iso || !isLive(l) || l.id === a.ignoreLessonId || !l.start || !l.end) continue
    const st = a.students.find((s) => s.id === l.studentId)
    const lt = a.lessonTypes.find((t) => t.id === l.lessonTypeId)
    items.push({
      title: `שיעור – ${l.studentName}`,
      start: toMin(l.start),
      end: toMin(l.end),
      place: placeKey(!!lt?.isZoom, st?.address ?? ''),
      blocksBreak: true,
    })
  }

  for (const it of items) {
    if (it.start < a.end && a.start < it.end) {
      out.push({ kind: 'overlap', text: `חופף ל: ${it.title} (${fromMin(it.start)}-${fromMin(it.end)})` })
      continue
    }
    if (a.noBreakCheck || !it.blocksBreak || buf <= 0) continue
    const gap = a.start >= it.end ? a.start - it.end : it.start - a.end
    const samePlace = a.place !== null && it.place === a.place
    if (gap < buf && !samePlace) out.push({ kind: 'break', text: `רק ${gap} דק׳ הפסקה מ: ${it.title}` })
  }

  // Important highlight rules (e.g. "משמרת מוקד"): warn when overlapping or within windowMin.
  if (important.length) {
    for (const p of day?.timed ?? []) {
      const rule = matchRule(p.event.title, important)
      if (!rule) continue
      const gap = a.start >= p.end ? a.start - p.end : p.start >= a.end ? p.start - a.end : -1
      if (gap < 0) out.push({ kind: 'rule', text: `חופף ל${rule.label || rule.keyword} (${fromMin(p.start)}-${fromMin(p.end)})` })
      else if (gap < rule.windowMin)
        out.push({ kind: 'rule', text: `קרוב ל${rule.label || rule.keyword} — ${gap} דק׳ (${fromMin(p.start)}-${fromMin(p.end)})` })
    }
    for (const ev of day?.allDay ?? []) {
      const rule = matchRule(ev.title, important)
      if (rule) out.push({ kind: 'rule', text: `${rule.label || rule.keyword} באותו יום (${ev.title})` })
    }
  }

  const wh = a.settings.workHours[weekdayOf(a.iso)]
  const inside = wh?.on && wh.ranges.some((r) => toMin(r.start) <= a.start && a.end <= toMin(r.end))
  if (!inside) out.push({ kind: 'hours', text: 'מחוץ לשעות העבודה' })
  return out
}
