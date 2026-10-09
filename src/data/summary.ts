// Monthly numbers. Cancelled and postponed lessons never count; lessons are
// counted in units (a ×2 lesson = 2 lessons). Prices are the stored per-lesson
// prices, so old months never change when rates change.
import { EVENT_COLORS, isLive, type Lesson, type LessonType } from './schema'

export const monthOf = (iso: string) => iso.slice(0, 7) // "2026-10"

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export function monthShort(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export interface MonthTotals {
  doneUnits: number // lessons that happened
  liveUnits: number // happened + planned
  expected: number // income of all live lessons in the month
  paid: number
  unpaid: number
}

export function monthTotals(lessons: Lesson[], ym: string): MonthTotals {
  const t: MonthTotals = { doneUnits: 0, liveUnits: 0, expected: 0, paid: 0, unpaid: 0 }
  for (const l of lessons) {
    if (monthOf(l.date) !== ym || !isLive(l)) continue
    t.liveUnits += l.units
    if (l.status === 'done') t.doneUnits += l.units
    t.expected += l.price
    if (l.paid) t.paid += l.price
  }
  t.unpaid = t.expected - t.paid
  return t
}

export interface BreakdownRow {
  key: string
  name: string
  color?: string
  units: number
  income: number
  unpaid: number
}

function breakdown(lessons: Lesson[], ym: string, keyOf: (l: Lesson) => string, nameOf: (key: string, l: Lesson) => string, colorOf?: (key: string) => string | undefined) {
  const rows = new Map<string, BreakdownRow>()
  for (const l of lessons) {
    if (monthOf(l.date) !== ym || !isLive(l)) continue
    const k = keyOf(l)
    const r = rows.get(k) ?? { key: k, name: nameOf(k, l), color: colorOf?.(k), units: 0, income: 0, unpaid: 0 }
    r.units += l.units
    r.income += l.price
    if (!l.paid) r.unpaid += l.price
    rows.set(k, r)
  }
  return [...rows.values()].sort((a, b) => b.income - a.income)
}

export const byType = (lessons: Lesson[], ym: string, types: LessonType[]) =>
  breakdown(
    lessons,
    ym,
    (l) => l.lessonTypeId,
    (k) => types.find((t) => t.id === k)?.name ?? 'ללא סוג',
    (k) => EVENT_COLORS[types.find((t) => t.id === k)?.color ?? '']?.hex,
  )

export const byStudent = (lessons: Lesson[], ym: string) =>
  breakdown(lessons, ym, (l) => l.studentId || l.studentName, (_, l) => l.studentName)

/** Every month that has lessons, plus the current one — newest first. */
export function monthsWithData(lessons: Lesson[], currentYm: string) {
  return [...new Set([currentYm, ...lessons.map((l) => monthOf(l.date)).filter((m) => /^\d{4}-\d{2}$/.test(m))])].sort().reverse()
}

/** Paid / unpaid income for `count` months ending at `endYm`. */
export function incomeByMonth(lessons: Lesson[], endYm: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const ym = addMonths(endYm, i - count + 1)
    const t = monthTotals(lessons, ym)
    return { ym, paid: t.paid, unpaid: t.unpaid }
  })
}
