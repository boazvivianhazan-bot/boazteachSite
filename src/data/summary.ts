// Monthly numbers. Cancelled and postponed lessons never count; lessons are
// counted in units (a ×2 lesson = 2 lessons). Prices are the stored per-lesson
// prices, so old months never change when rates change.
import { EVENT_COLORS, isLive, type Lesson, type LessonType, type Payment } from './schema'

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
  earned: number // income of lessons that happened (what was charged)
  received: number // money received in the month (payments)
}

/** A group lesson (rows sharing a groupId) is ONE lesson taught. */
const lessonKey = (l: Lesson) => l.groupId || l.id

export function monthTotals(lessons: Lesson[], ym: string, payments: Payment[] = []): MonthTotals {
  const t: MonthTotals = { doneUnits: 0, liveUnits: 0, expected: 0, earned: 0, received: 0 }
  const live = new Set<string>()
  const done = new Set<string>()
  for (const l of lessons) {
    if (monthOf(l.date) !== ym || !isLive(l)) continue
    // Lessons taught: counted once per lesson (a group once); income: every student's row.
    if (!live.has(lessonKey(l))) {
      live.add(lessonKey(l))
      t.liveUnits += l.units
    }
    t.expected += l.price
    if (l.status === 'done') {
      if (!done.has(lessonKey(l))) {
        done.add(lessonKey(l))
        t.doneUnits += l.units
      }
      t.earned += l.price
    }
  }
  for (const p of payments) if (monthOf(p.date) === ym) t.received += p.amount
  return t
}

export interface BreakdownRow {
  key: string
  name: string
  color?: string
  units: number
  income: number
}

function breakdown(
  lessons: Lesson[],
  ym: string,
  keyOf: (l: Lesson) => string,
  nameOf: (key: string, l: Lesson) => string,
  colorOf?: (key: string) => string | undefined,
  groupOnce = false, // count a group lesson once (per type); per student every row counts
) {
  const rows = new Map<string, BreakdownRow>()
  const counted = new Set<string>()
  for (const l of lessons) {
    if (monthOf(l.date) !== ym || !isLive(l)) continue
    const k = keyOf(l)
    const r = rows.get(k) ?? { key: k, name: nameOf(k, l), color: colorOf?.(k), units: 0, income: 0 }
    const once = `${k}|${lessonKey(l)}`
    if (!groupOnce || !counted.has(once)) {
      counted.add(once)
      r.units += l.units
    }
    r.income += l.price
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
    true,
  )

export const byStudent = (lessons: Lesson[], ym: string) =>
  breakdown(lessons, ym, (l) => l.studentId || l.studentName, (_, l) => l.studentName)

/** Every month that has lessons, plus the current one — newest first. */
export function monthsWithData(lessons: Lesson[], currentYm: string) {
  return [...new Set([currentYm, ...lessons.map((l) => monthOf(l.date)).filter((m) => /^\d{4}-\d{2}$/.test(m))])].sort().reverse()
}

/** Earned (lessons done) and received (payments) for `count` months ending at `endYm`. */
export function incomeByMonth(lessons: Lesson[], payments: Payment[], endYm: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const ym = addMonths(endYm, i - count + 1)
    const t = monthTotals(lessons, ym, payments)
    return { ym, earned: t.earned, received: t.received }
  })
}

/** Payments received in a month, newest first. */
export const monthPayments = (payments: Payment[], ym: string) =>
  payments.filter((p) => monthOf(p.date) === ym && p.amount).sort((a, b) => b.date.localeCompare(a.date))
