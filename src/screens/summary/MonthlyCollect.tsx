import { useState } from 'react'
import { Card } from '../../components/ui'
import { monthlyBills, type MonthlyBill } from '../../data/billing'
import { useDb } from '../../data/db'
import { useBilling } from '../../data/payments'
import type { LessonType } from '../../data/schema'
import { monthLabel } from '../../data/summary'
import { whatsappLink, whatsappPhone } from '../../lib/contact'
import { formatDate, ils } from '../../lib/format'
import { PaymentForm } from '../payments/PaymentForm'

/** Hebrew breakdown for WhatsApp: dates, types, total, minus credit / plus earlier debt. */
export function billText(b: MonthlyBill, ym: string, types: LessonType[]) {
  const greet = b.payer.members.find((m) => m.parentName)?.parentName
  const lines = b.lessons.map((l) => {
    const t = types.find((x) => x.id === l.lessonTypeId)?.name ?? 'שיעור'
    const who = b.payer.members.length > 1 ? ` (${l.studentName.split(' ')[0]})` : ''
    return `• ${formatDate(l.date).slice(0, 5)} – ${t}${l.units > 1 ? ` ×${l.units}` : ''}${who} – ${l.price} ₪`
  })
  const out = [`שלום${greet ? ` ${greet}` : ''},`, `סיכום שיעורים לחודש ${monthLabel(ym)}:`, ...lines, `סה״כ החודש: ${b.monthCharges} ₪`]
  // before = what was paid beyond earlier lessons (credit > 0) or still owed from before (< 0).
  if (b.before > 0) out.push(`בניכוי תשלומים / זכות: −${Math.min(b.before, b.monthCharges)} ₪`)
  if (b.before < 0) out.push(`יתרת חוב קודמת: ${-b.before} ₪`)
  const left = b.before - b.monthCharges // the current balance
  if (b.due > 0) out.push(`לתשלום: ${b.due} ₪`)
  else out.push(left > 0 ? `הכל שולם 🙂 נשארה זכות: ${left} ₪` : 'הכל שולם 🙂')
  out.push('תודה!')
  return out.join('\n')
}

export function MonthlyCollect({ ym }: { ym: string }) {
  const { lessons, lessonTypes } = useDb()
  const { payers, balances } = useBilling()
  const bills = monthlyBills(ym, lessons, payers, balances)
  const [open, setOpen] = useState<string | null>(null)
  const [paying, setPaying] = useState<MonthlyBill | null>(null)
  if (!bills.length) return null

  return (
    <section className="mt-4">
      <h3 className="mb-2 px-1 text-sm font-semibold text-gray-500">לגבייה החודש — משלמים בסוף חודש</h3>
      <Card className="p-0">
        <ul className="divide-y divide-gray-100">
          {bills.map((b) => {
            // WhatsApp: a member's parent phone first, else the first member's own phone.
            const phone = whatsappPhone(b.payer.members.find((m) => m.parentPhone) ?? b.payer.members[0])
            return (
              <li key={b.payer.id} className="px-4 py-3">
                <button className="flex w-full items-center gap-3 text-start" onClick={() => setOpen(open === b.payer.id ? null : b.payer.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{b.payer.name}</span>
                    <span className="block text-xs text-gray-500">
                      {b.lessons.length} שיעורים החודש · {ils(b.monthCharges)}
                      {b.before < 0 && ` · חוב קודם ${ils(-b.before)}`}
                      {b.due === 0 && b.before - b.monthCharges > 0 && ` · נשארה זכות ${ils(b.before - b.monthCharges)}`}
                    </span>
                  </span>
                  <span className={`shrink-0 text-lg font-bold ${b.due ? 'text-red-700' : 'text-green-700'}`}>{b.due ? ils(b.due) : '✓'}</span>
                </button>
                {open === b.payer.id && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 font-sans text-xs text-gray-700">{billText(b, ym, lessonTypes)}</pre>
                )}
                <div className="mt-2 flex gap-2">
                  {phone ? (
                    <a
                      href={whatsappLink(phone, billText(b, ym, lessonTypes))}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-green-600 text-sm font-medium text-white"
                    >
                      וואטסאפ עם הפירוט
                    </a>
                  ) : (
                    <span className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">אין טלפון</span>
                  )}
                  <button onClick={() => setPaying(b)} className="min-h-9 flex-1 rounded-lg bg-brand-700 text-sm font-medium text-white">
                    קיבלתי תשלום
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
      {paying && <PaymentForm payer={paying.payer} suggested={paying.due} onClose={() => setPaying(null)} />}
    </section>
  )
}
