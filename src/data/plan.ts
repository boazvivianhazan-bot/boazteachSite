import { isLive, type Lesson, type LessonType, type Settings, type Student } from './schema'
import { fittingIntervals, freeIntervals, slotsIn, subtract, type Iv } from '../lib/slots'
import { toMin, fromMin } from '../lib/time'
import { addDays, utcToZoned, weekdayOf } from '../lib/tz'
import { DAY_NAMES } from '../lib/format'
import type { BusyByDay } from './events'

/**
 * Where a lesson happens. Lessons at the same place need no travel break
 * between them: "zoom" for any Zoom lesson, otherwise the normalized address.
 * null = unknown address (never matches anything).
 */
export function placeKey(isZoom: boolean, address: string): string | null {
  if (isZoom) return 'zoom'
  const a = address.trim().replace(/\s+/g, ' ').toLowerCase()
  return a ? `addr:${a}` : null
}

export interface PlacedLesson {
  start: number
  end: number
  place: string | null
  name: string
}

/** A slot right before/after a lesson with no break — only for the same place. */
export interface AdjacentSlot {
  start: number
  end: number
  place: string
  nextTo: string // student name of the neighbouring lesson
}

export interface DayPlan {
  iso: string
  windows: Iv[] // work hours
  busy: Iv[] // from Google Calendar
  free: Iv[] // windows − (busy ± break), and not in the past
  slots: Iv[] // bookable lessons of the chosen length, for anyone
  adjacent: AdjacentSlot[] // extra back-to-back slots, same address / Zoom only
}

/** Lessons from the sheet grouped by date, each with its place. */
export function placedLessonsByDay(lessons: Lesson[], students: Student[], lessonTypes: LessonType[]) {
  const out: Record<string, PlacedLesson[]> = {}
  for (const l of lessons) {
    if (!isLive(l) || !l.start || !l.end) continue
    const st = students.find((s) => s.id === l.studentId)
    const lt = lessonTypes.find((t) => t.id === l.lessonTypeId)
    ;(out[l.date] ??= []).push({
      start: toMin(l.start),
      end: toMin(l.end),
      place: placeKey(!!lt?.isZoom, st?.address ?? ''),
      name: l.studentName,
    })
  }
  return out
}

export function planDay(
  iso: string,
  settings: Settings,
  busy: Iv[],
  lenMin: number,
  now = utcToZoned(new Date()),
  lessons: PlacedLesson[] = [],
): DayPlan {
  const day = settings.workHours[weekdayOf(iso)]
  const windows: Iv[] = day?.on ? day.ranges.map((r) => [toMin(r.start), toMin(r.end)]) : []
  const notBefore = iso < now.iso ? 24 * 60 : iso === now.iso ? now.min : 0
  const buf = settings.bufferMin
  const lessonIvs: Iv[] = lessons.map((l) => [l.start, l.end])

  // Regular slots: everything busy (calendar + sheet lessons) needs the break.
  const free = freeIntervals(windows, [...busy, ...lessonIvs], buf, notBefore)
  const slots = slotsIn(free, lenMin, buf)

  // Back-to-back slots: for each place, lessons at that place need no break;
  // other lessons and other calendar events still do.
  const adjacent: AdjacentSlot[] = []
  const otherBusy = subtract(busy, lessonIvs)
  const places = [...new Set(lessons.map((l) => l.place).filter((p): p is string => !!p))]
  for (const place of places) {
    const cuts: Iv[] = [
      ...otherBusy.map(([s, e]): Iv => [s - buf, e + buf]),
      ...lessons.map((l): Iv => (l.place === place ? [l.start, l.end] : [l.start - buf, l.end + buf])),
    ]
    if (notBefore > 0) cuts.push([-1, notBefore])
    const freeHere = subtract(windows, cuts)
    const fits = (s: number, e: number) => freeHere.some(([a, b]) => a <= s && e <= b)
    const taken = (s: number) => slots.some(([x]) => x === s) || adjacent.some((a) => a.start === s)
    for (const l of lessons.filter((x) => x.place === place)) {
      for (const [s, e] of [[l.end, l.end + lenMin], [l.start - lenMin, l.start]] as Iv[]) {
        if (fits(s, e) && !taken(s)) adjacent.push({ start: s, end: e, place, nextTo: l.name })
      }
    }
  }
  adjacent.sort((a, b) => a.start - b.start)

  return { iso, windows, busy, free, slots, adjacent }
}

// A plain hyphen keeps "15:00-16:45" in left-to-right order inside Hebrew text (an en dash gets reversed).
const ivText = ([s, e]: Iv) => `${fromMin(s)}-${fromMin(e)}`

/**
 * Short Hebrew text of the free hours for the 7 days starting today, for
 * WhatsApp. Uses regular free time only (back-to-back slots depend on who books).
 */
export function freeHoursText(
  todayIso: string,
  busy: BusyByDay,
  settings: Settings,
  lenMin: number,
  lessonsByDay: Record<string, PlacedLesson[]> = {},
) {
  const lines: string[] = []
  for (let i = 0; i < 7; i++) {
    const iso = addDays(todayIso, i)
    const plan = planDay(iso, settings, busy[iso] ?? [], lenMin, undefined, lessonsByDay[iso])
    const ivs = fittingIntervals(plan.free, lenMin)
    if (!ivs.length) continue
    const [, m, d] = iso.split('-')
    const label = i === 0 ? 'היום' : i === 1 ? 'מחר' : `יום ${DAY_NAMES[weekdayOf(iso)]}`
    lines.push(`• ${label} ${d}/${m}: ${ivs.map(ivText).join(', ')}`)
  }
  if (!lines.length) return 'אין כרגע שעות פנויות בשבוע הקרוב.'
  return ['שעות פנויות לשיעור בשבוע הקרוב:', ...lines].join('\n')
}
