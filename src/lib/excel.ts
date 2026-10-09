// "ייצוא לאקסל": the month's lessons as .xlsx with a totals row, plus a
// per-student sheet. SheetJS is loaded only when exporting.
import { monthOf, monthTotals, byStudent } from '../data/summary'
import type { Lesson, LessonType } from '../data/schema'
import { DAY_NAMES, formatDate } from './format'
import { weekdayOf } from './tz'

const STATUS: Record<Lesson['status'], string> = { planned: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל', postponed: 'נדחה' }

export async function exportMonth(lessons: Lesson[], ym: string, types: LessonType[]) {
  const XLSX = await import('xlsx')
  const rows = lessons
    .filter((l) => monthOf(l.date) === ym)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  const header = ['תאריך', 'יום', 'שעה', 'תלמיד', 'סוג שיעור', 'כמות', 'מחיר (₪)', 'סטטוס', 'שולם', 'הערות']
  const body = rows.map((l) => [
    formatDate(l.date),
    DAY_NAMES[weekdayOf(l.date)],
    `${l.start}-${l.end}`,
    l.studentName,
    types.find((t) => t.id === l.lessonTypeId)?.name ?? '',
    l.units,
    l.price,
    STATUS[l.status],
    l.status === 'cancelled' || l.status === 'postponed' ? '' : l.paid ? 'כן' : 'לא',
    l.notes,
  ])
  const t = monthTotals(lessons, ym)
  // Totals line up with their columns: units under "כמות", income under "מחיר".
  // Cancelled / postponed lessons are listed above but not counted.
  const totals = [
    ['סה״כ', '', '', '', '', t.liveUnits, t.expected, `התקיימו ${t.doneUnits}`, `שולם ${t.paid} ₪`, `לא שולם ${t.unpaid} ₪`],
  ]
  const ws = XLSX.utils.aoa_to_sheet([header, ...body, [], ...totals])
  ws['!cols'] = [12, 8, 13, 18, 16, 7, 10, 14, 12, 24].map((wch) => ({ wch }))

  const students = byStudent(lessons, ym)
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['תלמיד', 'שיעורים', 'הכנסה (₪)', 'לא שולם (₪)'],
    ...students.map((s) => [s.name, s.units, s.income, s.unpaid]),
    [],
    ['סה״כ', t.liveUnits, t.expected, t.unpaid],
  ])
  ws2['!cols'] = [20, 10, 12, 14].map((wch) => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'שיעורים')
  XLSX.utils.book_append_sheet(wb, ws2, 'לפי תלמיד')
  wb.Workbook = { Views: [{ RTL: true }] } // right-to-left sheets in Excel
  XLSX.writeFile(wb, `שיעורים-${ym}.xlsx`)
}
