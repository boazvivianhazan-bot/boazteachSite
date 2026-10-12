import { useState } from 'react'
import { ErrorBox } from '../../components/ui'
import { balanceText, toCollect } from '../../data/billing'
import { useDb } from '../../data/db'
import { blankPayment, doneAndPaid, savePayment, useBilling } from '../../data/payments'
import type { Lesson } from '../../data/schema'
import { errorText } from '../../lib/api'
import { ils } from '../../lib/format'
import { todayIso } from '../../lib/tz'
import { PaymentForm } from './PaymentForm'

/**
 * On a lesson: "לגבות היום: X ₪" (price minus the payer's credit), mark done,
 * and mark done + record the payment in one tap.
 */
export function CollectPanel({ lesson }: { lesson: Lesson }) {
  const { db, students, settings } = useDb()
  const { payerOfStudent, balanceOf } = useBilling()
  const student = students.find((s) => s.id === lesson.studentId)
  const payer = payerOfStudent(student, lesson.studentId)
  const balance = payer ? balanceOf(payer.id).balance : 0
  const collect = toCollect(lesson, balance)
  const [method, setMethod] = useState(settings.paymentMethods[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(false)
  const done = lesson.status === 'done'

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleDone = () => run(() => db.upsert('Lessons', [{ ...lesson, status: done ? 'planned' : 'done' }]))
  const quickPay = () =>
    run(() =>
      done
        ? savePayment(db, blankPayment(payer?.id ?? lesson.studentId, todayIso(), collect, method))
        : doneAndPaid(db, lesson, student, collect, method, todayIso()),
    )

  return (
    <div className="space-y-2 rounded-2xl bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-gray-500">{payer?.isFamily ? payer.name : 'יתרה'}: <b className={balance < 0 ? 'text-red-700' : balance > 0 ? 'text-green-700' : ''}>{balanceText(balance, ils)}</b></span>
        {payer?.paysMonthly ? (
          <span className="text-sm text-gray-500">משלם בסוף חודש</span>
        ) : (
          <span className="text-lg font-bold">לגבות היום: {ils(collect)}</span>
        )}
      </div>

      {!payer?.paysMonthly && collect > 0 && settings.paymentMethods.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {settings.paymentMethods.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={`rounded-full px-3 py-1 text-xs ${method === m ? 'bg-brand-700 font-semibold text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={toggleDone}
          className={`min-h-12 rounded-xl font-medium ${done ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          {done ? '✓ התקיים' : 'התקיים'}
        </button>
        {!payer?.paysMonthly && collect > 0 ? (
          <button disabled={busy} onClick={quickPay} className="min-h-12 rounded-xl bg-brand-700 font-medium text-white">
            {busy ? '…' : done ? `קיבלתי ${ils(collect)}` : `התקיים + קיבלתי ${ils(collect)}`}
          </button>
        ) : (
          <span className="flex min-h-12 items-center justify-center rounded-xl bg-green-50 text-center text-sm text-green-800">
            {payer?.paysMonthly ? 'ייגבה בסיכום החודשי' : done ? 'שולם ✓' : 'מכוסה מהזכות'}
          </span>
        )}
      </div>
      <button type="button" onClick={() => setForm(true)} className="text-sm text-brand-700">
        קיבלתי סכום אחר…
      </button>
      {error && <ErrorBox message={error} />}
      {form && payer && <PaymentForm payer={payer} suggested={Math.max(0, -balance) || collect} onClose={() => setForm(false)} />}
    </div>
  )
}
