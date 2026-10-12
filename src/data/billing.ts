// Payments & balances (stage 6). Pure functions — type-only imports, so they
// can be unit-tested directly.
//
// Payer: a student, or a family (students sharing a familyId).
// Balance = payments − charges, where a charge is the price of a lesson with
// status "done". Cancelled / postponed / planned lessons are never charged.
// Positive balance = credit (זכות), negative = debt (חוב).
import type { Lesson, Payment, Student } from './schema'

export interface Payer {
  id: string // studentId, or familyId
  name: string
  members: Student[]
  isFamily: boolean
  paysMonthly: boolean
}

export const payerIdOf = (s: Pick<Student, 'id' | 'familyId'>) => s.familyId || s.id

/** "משפחת כהן" from a parent's full name, otherwise the children's first names ("דנה + נועה"). */
export function familyName(members: Student[]) {
  const parent = members.find((m) => m.parentName.trim().includes(' '))?.parentName.trim()
  if (parent) return `משפחת ${parent.split(/\s+/).slice(-1)[0]}`
  return members.map((m) => m.name.trim().split(/\s+/)[0]).join(' + ')
}

/** Every payer: families (2+ members sharing familyId) and individual students. */
export function buildPayers(students: Student[]): Map<string, Payer> {
  const groups = new Map<string, Student[]>()
  for (const s of students) {
    const id = payerIdOf(s)
    groups.set(id, [...(groups.get(id) ?? []), s])
  }
  const out = new Map<string, Payer>()
  for (const [id, members] of groups) {
    const isFamily = !!members[0].familyId
    out.set(id, {
      id,
      name: isFamily ? familyName(members) : members[0].name,
      members,
      isFamily,
      paysMonthly: members.some((m) => m.paysMonthly),
    })
  }
  return out
}

/** Charge of one lesson: its price if it happened, otherwise nothing. */
export const chargeOf = (l: Pick<Lesson, 'status' | 'price'>) => (l.status === 'done' ? l.price : 0)

export interface Balance {
  charges: number
  paid: number
  balance: number // paid − charges
}

/** Balance per payer id. Lessons of unknown students are charged to their studentId. */
export function computeBalances(lessons: Lesson[], payments: Payment[], students: Student[]): Map<string, Balance> {
  const payerOfStudent = new Map(students.map((s) => [s.id, payerIdOf(s)]))
  const out = new Map<string, Balance>()
  const get = (id: string) => {
    let b = out.get(id)
    if (!b) out.set(id, (b = { charges: 0, paid: 0, balance: 0 }))
    return b
  }
  for (const l of lessons) {
    const c = chargeOf(l)
    if (c) get(payerOfStudent.get(l.studentId) ?? l.studentId).charges += c
  }
  for (const p of payments) if (p.amount) get(p.payerId).paid += p.amount
  for (const b of out.values()) b.balance = b.paid - b.charges
  return out
}

export interface StudentBalance {
  charges: number // her own done lessons
  allocated: number // the part of her payer's payments applied to her lessons
  balance: number // allocated − charges; for family members never positive (credit stays with the family)
}

/**
 * Each student's OWN balance. A payer's payments are applied FIFO to the
 * oldest done lessons across all its members; whatever is left over is credit
 * that stays at payer (family) level. A student who pays alone gets her
 * payer's full balance, credit included.
 */
export function computeStudentBalances(lessons: Lesson[], payments: Payment[], students: Student[]): Map<string, StudentBalance> {
  const payerOfStudent = new Map(students.map((s) => [s.id, payerIdOf(s)]))
  const familyOf = new Map(students.map((s) => [s.id, !!s.familyId]))
  const paidBy = new Map<string, number>()
  for (const p of payments) if (p.amount) paidBy.set(p.payerId, (paidBy.get(p.payerId) ?? 0) + p.amount)

  // Done lessons per payer, oldest first (id breaks ties so the order is stable).
  const byPayer = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (!chargeOf(l)) continue
    const pid = payerOfStudent.get(l.studentId) ?? l.studentId
    byPayer.set(pid, [...(byPayer.get(pid) ?? []), l])
  }

  const out = new Map<string, StudentBalance>()
  const get = (id: string) => {
    let b = out.get(id)
    if (!b) out.set(id, (b = { charges: 0, allocated: 0, balance: 0 }))
    return b
  }
  for (const s of students) get(s.id)
  for (const [pid, list] of byPayer) {
    let left = paidBy.get(pid) ?? 0
    list.sort((a, b) => (a.date + a.start + a.id).localeCompare(b.date + b.start + b.id))
    for (const l of list) {
      const b = get(l.studentId)
      const take = Math.min(l.price, Math.max(0, left))
      b.charges += l.price
      b.allocated += take
      left -= take
    }
  }
  for (const [sid, b] of out) {
    if (familyOf.get(sid)) b.balance = b.allocated - b.charges
    else {
      // Pays alone: her balance is the payer's balance (credit included).
      b.balance = (paidBy.get(sid) ?? 0) - b.charges
    }
  }
  return out
}

/** Balance of one payer as text: "זכות 50 ₪" / "חוב 150 ₪" / "מאוזן". */
export function balanceText(balance: number, ils: (n: number) => string) {
  if (balance > 0) return `זכות ${ils(balance)}`
  if (balance < 0) return `חוב ${ils(-balance)}`
  return 'מאוזן'
}

/**
 * "לגבות היום" for a lesson: its price minus the payer's credit, never below 0.
 * The lesson's own charge is left out of the credit (if it's already marked done).
 */
export function toCollect(lesson: Pick<Lesson, 'status' | 'price'>, payerBalance: number) {
  const creditBefore = payerBalance + chargeOf(lesson)
  return Math.max(0, lesson.price - Math.max(0, creditBefore))
}

/** Prepaid: about how many more lessons the credit covers. */
export function prepaidLessons(balance: number, typicalPrice: number) {
  if (balance <= 0 || typicalPrice <= 0) return 0
  return Math.floor(balance / typicalPrice)
}

export interface MonthlyBill {
  payer: Payer
  lessons: Lesson[] // done lessons of the month
  monthCharges: number
  before: number // balance before this month's charges (credit > 0, debt < 0)
  due: number // what to collect now = max(0, −balance)
}

/**
 * "לגבייה החודש": monthly payers with done lessons in the month (or open debt).
 * Uses the current balance, so payments already received are deducted.
 */
export function monthlyBills(ym: string, lessons: Lesson[], payers: Map<string, Payer>, balances: Map<string, Balance>): MonthlyBill[] {
  const out: MonthlyBill[] = []
  for (const payer of payers.values()) {
    if (!payer.paysMonthly) continue
    const ids = new Set(payer.members.map((m) => m.id))
    const month = lessons
      .filter((l) => ids.has(l.studentId) && l.status === 'done' && l.date.startsWith(ym))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    const monthCharges = month.reduce((s, l) => s + l.price, 0)
    const balance = balances.get(payer.id)?.balance ?? 0
    const due = Math.max(0, -balance)
    if (!month.length && !due) continue
    out.push({ payer, lessons: month, monthCharges, before: balance + monthCharges, due })
  }
  return out.sort((a, b) => b.due - a.due)
}
