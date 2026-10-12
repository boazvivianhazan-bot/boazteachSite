import { useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { Field, TextInput } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import type { Payer } from '../../data/billing'
import { useDb } from '../../data/db'
import { blankPayment, savePayment, voidPayment } from '../../data/payments'
import type { Payment } from '../../data/schema'
import { errorText } from '../../lib/api'
import { todayIso } from '../../lib/tz'

/** "קיבלתי תשלום" — new payment (amount prefilled, editable) or edit an existing one. */
export function PaymentForm({
  payer,
  suggested,
  initial,
  onClose,
}: {
  payer: Payer
  suggested?: number // prefilled amount (what's owed now)
  initial?: Payment
  onClose: () => void
}) {
  const { db, settings } = useDb()
  const methods = settings.paymentMethods
  const [p, setP] = useState<Payment>(
    initial ?? blankPayment(payer.id, todayIso(), Math.max(0, Math.round(suggested ?? 0)), methods[0] ?? ''),
  )
  const [amountText, setAmountText] = useState(String(p.amount || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = Number(amountText)
  const valid = amountText.trim() !== '' && Number.isFinite(amount) && amount > 0 && p.date

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay
      open
      title={initial ? `עריכת תשלום – ${payer.name}` : `קיבלתי תשלום – ${payer.name}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button className="w-full" disabled={!valid || busy} onClick={() => run(() => savePayment(db, { ...p, amount }))}>
            {busy ? 'שומר…' : `שמירה${valid ? ` · ${amount.toLocaleString('he-IL')} ₪` : ''}`}
          </Button>
          {initial && initial.amount > 0 && (
            <Button variant="secondary" className="w-full text-red-700" disabled={busy} onClick={() => run(() => voidPayment(db, initial))}>
              ביטול התשלום
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {payer.isFamily && <p className="text-sm text-gray-500">משלם עבור: {payer.members.map((m) => m.name).join(', ')}</p>}
        <Field label="סכום (₪)" hint={suggested !== undefined && !initial ? `החוב כרגע: ${Math.max(0, Math.round(suggested))} ₪ — אפשר לשנות לכל סכום` : undefined}>
          <TextInput type="number" inputMode="decimal" min={0} value={amountText} onChange={(e) => setAmountText(e.target.value)} autoFocus />
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">אמצעי תשלום</span>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...methods, ...(p.method && !methods.includes(p.method) ? [p.method] : [])])].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={p.method === m}
                onClick={() => setP({ ...p, method: m })}
                className={`min-h-10 rounded-full px-4 text-sm ${p.method === m ? 'bg-brand-700 font-semibold text-white' : 'bg-white text-gray-700 shadow-sm'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <Field label="תאריך">
          <TextInput type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} />
        </Field>
        <Field label="הערות">
          <TextInput value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} />
        </Field>
        {error && <ErrorBox message={error} />}
      </div>
    </Overlay>
  )
}
