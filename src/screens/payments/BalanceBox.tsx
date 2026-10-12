import { useMemo, useState } from 'react'
import { Button, Card } from '../../components/ui'
import { balanceText, prepaidLessons, type Payer } from '../../data/billing'
import { useDb } from '../../data/db'
import { useBilling } from '../../data/payments'
import type { Payment, Student } from '../../data/schema'
import { formatDate, ils } from '../../lib/format'
import { PaymentForm } from './PaymentForm'

/** Typical lesson price for a payer: their next planned lesson, else their default type's price. */
function useTypicalPrice(payer: Payer) {
  const { lessons, lessonTypes } = useDb()
  return useMemo(() => {
    const ids = new Set(payer.members.map((m) => m.id))
    const next = lessons
      .filter((l) => ids.has(l.studentId) && l.status === 'planned')
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0]
    if (next) return next.price
    const prices = payer.members
      .map((m) => lessonTypes.find((t) => t.id === m.defaultLessonTypeId)?.price ?? 0)
      .filter((x) => x > 0)
    return prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
  }, [payer, lessons, lessonTypes])
}

/**
 * Balance line, prepaid hint, "קיבלתי תשלום" and payment history for one payer.
 * On a family member's card (`student`), her OWN balance is the big line and the
 * family total sits under it, with the payment button for the whole family.
 */
export function BalanceBox({ payer, student }: { payer: Payer; student?: Student }) {
  const { payments } = useDb()
  const { balanceOf, ownBalanceOf } = useBilling()
  const { balance, charges, paid } = balanceOf(payer.id)
  const showOwn = payer.isFamily && !!student
  const own = student ? ownBalanceOf(student.id) : balance
  const big = showOwn ? own : balance
  const typical = useTypicalPrice(payer)
  const prepaid = prepaidLessons(balance, typical)
  const [form, setForm] = useState<{ initial?: Payment } | null>(null)
  const history = payments
    .filter((p) => p.payerId === payer.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  return (
    <section className="space-y-2">
      <Card className={big < 0 ? 'bg-red-50' : big > 0 ? 'bg-green-50' : ''}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500">{showOwn ? `יתרה — ${student!.name}` : 'יתרה'}</div>
            <div className={`text-2xl font-bold ${big < 0 ? 'text-red-700' : big > 0 ? 'text-green-700' : 'text-gray-800'}`}>
              {balanceText(big, ils)}
            </div>
            {!showOwn && prepaid > 0 && <div className="text-sm text-green-800">משולם מראש – עוד ~{prepaid} שיעורים</div>}
            {!showOwn && payer.paysMonthly && <div className="text-xs text-gray-500">משלם בסוף חודש</div>}
          </div>
          {!showOwn && (
            <Button className="shrink-0" onClick={() => setForm({})}>
              קיבלתי תשלום
            </Button>
          )}
        </div>
        {showOwn ? (
          // The whole family: one total, one payment button (prefilled with the family debt).
          <div className="mt-3 flex items-center gap-3 border-t border-black/5 pt-3">
            <div className="flex-1 text-sm">
              <span className="text-gray-600">{payer.name} יחד: </span>
              <b className={balance < 0 ? 'text-red-700' : balance > 0 ? 'text-green-700' : ''}>{balanceText(balance, ils)}</b>
              {prepaid > 0 && <span className="block text-xs text-green-800">משולם מראש – עוד ~{prepaid} שיעורים</span>}
              {payer.paysMonthly && <span className="block text-xs text-gray-500">משלם בסוף חודש</span>}
            </div>
            <Button className="min-h-10 shrink-0 text-sm" onClick={() => setForm({})}>
              קיבלתי תשלום
            </Button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-gray-500">
          {showOwn ? `${payer.name}: ` : ''}שולם {ils(paid)} · שיעורים שהתקיימו {ils(charges)}
        </p>
      </Card>

      {history.length > 0 && (
        <Card className="p-0">
          <h3 className="px-4 pb-1 pt-3 text-sm font-semibold text-gray-500">תשלומים ({history.filter((p) => p.amount > 0).length})</h3>
          <ul className="divide-y divide-gray-100">
            {history.map((p) => (
              <li key={p.id}>
                <button onClick={() => setForm({ initial: p })} className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm active:bg-gray-50">
                  <span className="w-20 shrink-0">{formatDate(p.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-500">{[p.method, p.notes].filter(Boolean).join(' · ')}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${p.amount ? 'text-green-700' : 'text-gray-400 line-through'}`}>{ils(p.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {form && <PaymentForm payer={payer} suggested={Math.max(0, -balance)} initial={form.initial} onClose={() => setForm(null)} />}
    </section>
  )
}
