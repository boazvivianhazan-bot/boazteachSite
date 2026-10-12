// "ייצוא לאקסל": the month as .xlsx — lessons (with totals), per student,
// the month's payments, and every payer's balance. SheetJS loads only on export.
import { balanceText, buildPayers, computeBalances } from '../data/billing'
import { byStudent, monthOf, monthPayments, monthTotals } from '../data/summary'
import type { Lesson, LessonType, Payment, Student } from '../data/schema'
import { DAY_NAMES, formatDate, ils } from './format'
import { todayIso, weekdayOf } from './tz'

const STATUS: Record<Lesson['status'], string> = { planned: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל', postponed: 'נדחה' }

export async function exportMonth(lessons: Lesson[], ym: string, types: LessonType[], payments: Payment[], students: Student[]) {
  const XLSX = await import('xlsx')
  const t = monthTotals(lessons, ym, payments)
  const sheet = (rows: unknown[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = widths.map((wch) => ({ wch }))
    return ws
  }

  // 1. Lessons — cancelled / postponed are listed but not counted.
  const rows = lessons.filter((l) => monthOf(l.date) === ym).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const lessonsWs = sheet(
    [
      ['תאריך', 'יום', 'שעה', 'תלמיד', 'סוג שיעור', 'כמות', 'מחיר (₪)', 'סטטוס', 'הערות'],
      ...rows.map((l) => [
        formatDate(l.date), DAY_NAMES[weekdayOf(l.date)], `${l.start}-${l.end}`, l.studentName,
        types.find((x) => x.id === l.lessonTypeId)?.name ?? '', l.units, l.price, STATUS[l.status], l.notes,
      ]),
      [],
      ['סה״כ', '', '', '', '', t.liveUnits, t.expected, `התקיימו ${t.doneUnits}`, `הכנסה מהשיעורים שהתקיימו: ${t.earned} ₪`],
    ],
    [12, 8, 13, 18, 16, 7, 10, 12, 30],
  )

  // 2. Per student.
  const perStudent = byStudent(lessons, ym)
  const studentsWs = sheet(
    [['תלמיד', 'שיעורים', 'הכנסה (₪)'], ...perStudent.map((s) => [s.name, s.units, s.income]), [], ['סה״כ', t.liveUnits, t.expected]],
    [20, 10, 12],
  )

  // 3. Payments received this month.
  const payers = buildPayers(students)
  const payerName = (id: string) => payers.get(id)?.name ?? students.find((s) => s.id === id)?.name ?? id
  const monthPays = monthPayments(payments, ym).reverse()
  const paymentsWs = sheet(
    [
      ['תאריך', 'משלם', 'סכום (₪)', 'אמצעי תשלום', 'הערות'],
      ...monthPays.map((p) => [formatDate(p.date), payerName(p.payerId), p.amount, p.method, p.notes]),
      [],
      ['סה״כ התקבל', '', t.received],
    ],
    [12, 22, 10, 14, 30],
  )

  // 4. Balances of every payer, as of today.
  const balances = computeBalances(lessons, payments, students)
  const balanceRows = [...balances.entries()]
    .map(([id, b]) => ({ id, ...b, payer: payers.get(id) }))
    .sort((a, b) => a.balance - b.balance)
  const balancesWs = sheet(
    [
      [`יתרות נכון ל-${formatDate(todayIso())}`],
      ['משלם', 'תלמידים', 'חיובים (שיעורים שהתקיימו)', 'תשלומים', 'יתרה (₪)', 'מצב'],
      ...balanceRows.map((r) => [
        r.payer?.name ?? payerName(r.id),
        r.payer?.members.map((m) => m.name).join(', ') ?? '',
        r.charges, r.paid, r.balance, balanceText(r.balance, ils),
      ]),
      [],
      [
        'סה״כ', '',
        balanceRows.reduce((s, r) => s + r.charges, 0),
        balanceRows.reduce((s, r) => s + r.paid, 0),
        balanceRows.reduce((s, r) => s + r.balance, 0),
        `חובות פתוחים: ${balanceRows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0)} ₪`,
      ],
    ],
    [22, 26, 22, 12, 12, 16],
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, lessonsWs, 'שיעורים')
  XLSX.utils.book_append_sheet(wb, studentsWs, 'לפי תלמיד')
  XLSX.utils.book_append_sheet(wb, paymentsWs, 'תשלומים')
  XLSX.utils.book_append_sheet(wb, balancesWs, 'יתרות')
  wb.Workbook = { Views: [{ RTL: true }] } // right-to-left sheets in Excel
  XLSX.writeFile(wb, `שיעורים-${ym}.xlsx`)
}
