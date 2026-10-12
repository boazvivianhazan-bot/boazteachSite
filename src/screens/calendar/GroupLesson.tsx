import { useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { cancelLesson, setLessonFlags, updateLessons, type OpsCtx } from '../../data/lessonOps'
import { groupPrice, type Lesson } from '../../data/schema'
import { errorText } from '../../lib/api'
import { ils } from '../../lib/format'
import { CollectPanel } from '../payments/CollectPanel'

const STATUS: Record<Lesson['status'], string> = { planned: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל', postponed: 'נדחה' }

/**
 * Members of a group lesson: per student their price and status, collecting,
 * and cancelling just that student. After cancelling one, the price of the
 * others is recalculated for the smaller group — only if confirmed.
 */
export function GroupLesson({ rows, ctx }: { rows: Lesson[]; ctx: OpsCtx }) {
  const { lessons, lessonTypes } = useDb()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collecting, setCollecting] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [reprice, setReprice] = useState<{ rows: Lesson[]; from: number; to: number } | null>(null)
  const type = lessonTypes.find((t) => t.id === rows[0]?.lessonTypeId)
  const allDone = rows.every((r) => r.status === 'done')

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

  async function cancelOne(r: Lesson) {
    await cancelLesson(ctx, r)
    setConfirmCancel(null)
    const remaining = rows.filter((x) => x.id !== r.id)
    if (!type || !remaining.length) return
    const to = groupPrice(type, remaining.length) * remaining[0].units
    const from = remaining[0].price
    if (to !== from) setReprice({ rows: remaining, from, to })
  }

  const collectRow = collecting ? lessons.find((l) => l.id === collecting) : undefined

  return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">👥 קבוצה של {rows.length}</span>
          <button
            disabled={busy}
            onClick={() => run(() => setLessonFlags(ctx, rows, { status: allDone ? 'planned' : 'done' }))}
            className={`min-h-9 rounded-lg px-3 text-sm font-medium ${allDone ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {allDone ? '✓ התקיים (כולם)' : 'התקיים לכל הקבוצה'}
          </button>
        </div>
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.studentName}</span>
                  <span className="text-xs text-gray-500">
                    {ils(r.price)} · {STATUS[r.status]}
                  </span>
                </span>
                <button onClick={() => setCollecting(r.id)} className="min-h-9 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white">
                  ₪ גבייה
                </button>
                {confirmCancel === r.id ? (
                  <button disabled={busy} onClick={() => run(() => cancelOne(r))} className="min-h-9 rounded-lg bg-red-600 px-3 text-sm font-medium text-white">
                    {busy ? '…' : 'לבטל?'}
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => setConfirmCancel(r.id)} className="min-h-9 rounded-lg bg-gray-100 px-3 text-sm text-red-700">
                    ביטול רק ל{r.studentName.split(' ')[0]}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-500">ביטול לתלמיד אחד משאיר את השיעור לשאר ומעדכן את האירוע ביומן.</p>
      </div>

      {reprice && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {reprice.rows.length === 1 ? 'נשאר תלמיד אחד' : `נשארו ${reprice.rows.length} תלמידים`}. לעדכן את המחיר לפי {reprice.rows.length === 1 ? 'שיעור יחיד' : `קבוצה של ${reprice.rows.length}`}?{' '}
            <b>
              {ils(reprice.from)} → {ils(reprice.to)}
            </b>
          </p>
          <div className="flex gap-2">
            <Button
              className="min-h-9 flex-1 text-sm"
              disabled={busy}
              onClick={() => run(() => updateLessons(ctx, reprice.rows.map((r) => ({ ...r, price: reprice.to })))).then(() => setReprice(null))}
            >
              כן, לעדכן
            </Button>
            <Button variant="secondary" className="min-h-9 flex-1 text-sm" disabled={busy} onClick={() => setReprice(null)}>
              לא, להשאיר
            </Button>
          </div>
        </div>
      )}
      {error && <ErrorBox message={error} />}

      {collectRow && (
        <Overlay open title={`גבייה – ${collectRow.studentName}`} onClose={() => setCollecting(null)}>
          <CollectPanel lesson={collectRow} />
        </Overlay>
      )}
    </div>
  )
}
