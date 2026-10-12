// Payment writes + the live balances hook.
import { useMemo } from 'react'
import { buildPayers, computeBalances, computeStudentBalances, payerIdOf, type Balance, type Payer } from './billing'
import type { Database } from './db'
import { useDb } from './db'
import { newId, type Lesson, type Payment, type Student } from './schema'

export function blankPayment(payerId: string, date: string, amount: number, method: string): Payment {
  return { id: newId('pm'), date, payerId, amount, method, notes: '' }
}

export function savePayment(db: Database, p: Payment) {
  return db.upsert('Payments', [{ ...p, notes: p.notes.trim(), method: p.method.trim() }])
}

/** "דחה תשלום": payments are never deleted — amount 0 keeps the row as a record. */
export function voidPayment(db: Database, p: Payment) {
  return db.upsert('Payments', [{ ...p, amount: 0, notes: `בוטל (היה ${p.amount} ₪)${p.notes ? ` · ${p.notes}` : ''}` }])
}

/** One tap: mark the lesson done and record the payment for it. */
export async function doneAndPaid(db: Database, lesson: Lesson, student: Student | undefined, amount: number, method: string, date: string) {
  await Promise.all([
    db.upsert('Lessons', [{ ...lesson, status: 'done' }]),
    amount > 0 ? savePayment(db, blankPayment(student ? payerIdOf(student) : lesson.studentId, date, amount, method)) : Promise.resolve(),
  ])
}

/**
 * One-time migration: every lesson marked "paid" becomes a payment (same date,
 * amount = lesson price). Ids come from the lesson id, so running it twice
 * (e.g. on two devices) writes the same rows instead of duplicating.
 */
export async function migratePaidLessons(db: Database) {
  const { lessons, students, payments, settings } = db.snapshot
  const payerOf = new Map(students.map((s) => [s.id, payerIdOf(s)]))
  const existing = new Set(payments.map((p) => p.id))
  const rows: Payment[] = lessons
    .filter((l) => l.paid && l.price > 0)
    .map((l) => ({
      id: `pm_paid_${l.id}`,
      date: l.date,
      payerId: payerOf.get(l.studentId) ?? l.studentId,
      amount: l.price,
      method: '',
      notes: 'הועבר מסימון שולם',
    }))
    .filter((p) => !existing.has(p.id))
  if (rows.length) await db.upsert('Payments', rows)
  await db.saveSettings({ ...settings, paymentsMigrated: true })
  return rows.length
}

/** Payers and live balances, recomputed whenever lessons, payments or students change. */
export function useBilling() {
  const { lessons, payments, students } = useDb()
  return useMemo(() => {
    const payers = buildPayers(students)
    const balances = computeBalances(lessons, payments, students)
    const payerOfStudent = (s: Student | undefined, fallbackId = ''): Payer | undefined =>
      s ? payers.get(payerIdOf(s)) : payers.get(fallbackId)
    const balanceOf = (payerId: string): Balance => balances.get(payerId) ?? { charges: 0, paid: 0, balance: 0 }
    // A student's OWN balance (family payments allocated FIFO to the oldest lessons).
    const studentBalances = computeStudentBalances(lessons, payments, students)
    const ownBalanceOf = (studentId: string) => studentBalances.get(studentId)?.balance ?? 0
    return { payers, balances, payerOfStudent, balanceOf, ownBalanceOf }
  }, [lessons, payments, students])
}
