import { useState } from 'react'
import { Button, Card, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { newId, type Student } from '../../data/schema'
import { errorText } from '../../lib/api'

/**
 * Family = several students paid by one payer (e.g. two sisters, one parent).
 * Linking sets the same familyId on both students; leaving clears it.
 */
export function FamilySection({ student }: { student: Student }) {
  const { db, students, payments } = useDb()
  const [picking, setPicking] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const members = student.familyId ? students.filter((s) => s.familyId === student.familyId) : [student]
  const others = members.filter((s) => s.id !== student.id)
  const candidates = students
    .filter((s) => s.active && !members.some((m) => m.id === s.id))
    .sort((a, b) => Number(b.address === student.address && !!b.address) - Number(a.address === student.address && !!a.address) || a.name.localeCompare(b.name, 'he'))

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setPicking(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function link(other: Student) {
    // Join the existing family of either student, or start a new one.
    const fid = student.familyId || other.familyId || newId('fm')
    const toUpdate = students.filter((s) => s.id === student.id || s.id === other.id || (other.familyId && s.familyId === other.familyId))
    // Payments a joining student made on their own move to the family, so the shared balance includes them.
    const joining = new Set(toUpdate.filter((s) => !s.familyId).map((s) => s.id))
    const moved = payments.filter((p) => joining.has(p.payerId)).map((p) => ({ ...p, payerId: fid }))
    return run(() =>
      Promise.all([db.upsert('Students', toUpdate.map((s) => ({ ...s, familyId: fid }))), moved.length ? db.upsert('Payments', moved) : null]),
    )
  }

  // Leaving a family of two dissolves it: its payments go to the student who stays.
  const dissolves = others.length === 1
  const familyPayments = payments.filter((p) => p.payerId === student.familyId)

  function leave() {
    const toClear = dissolves ? members : [student]
    const moved = dissolves ? familyPayments.map((p) => ({ ...p, payerId: others[0].id })) : []
    return run(() =>
      Promise.all([db.upsert('Students', toClear.map((s) => ({ ...s, familyId: '' }))), moved.length ? db.upsert('Payments', moved) : null]),
    )
  }

  return (
    <Card className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-500">משפחה / משלם</h3>
      {others.length ? (
        <p className="text-sm">
          משלם משותף עם: <b>{others.map((s) => s.name).join(', ')}</b>
        </p>
      ) : (
        <p className="text-sm text-gray-500">משלם לבד. אחים שמשלם עליהם אותו הורה אפשר לקשר למשפחה אחת עם יתרה משותפת.</p>
      )}
      {picking ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">בחירת תלמיד לקישור (באותה כתובת — למעלה):</p>
          <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
            {candidates.map((s) => (
              <li key={s.id}>
                <button disabled={busy} onClick={() => link(s)} className="block w-full px-3 py-2.5 text-start text-sm active:bg-gray-50">
                  {s.name}
                  {s.address && <span className="block text-xs text-gray-500">{s.address}</span>}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="w-full min-h-9 text-sm" onClick={() => setPicking(false)}>
            ביטול
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="min-h-10 flex-1 text-sm" disabled={busy} onClick={() => setPicking(true)}>
            + קישור לבן/בת משפחה
          </Button>
          {others.length > 0 && !confirmLeave && (
            <Button variant="secondary" className="min-h-10 flex-1 text-sm text-red-700" disabled={busy} onClick={() => setConfirmLeave(true)}>
              יציאה מהמשפחה
            </Button>
          )}
        </div>
      )}
      {confirmLeave && (
        <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
          <p>
            {student.name} ישלם/תשלם לבד מעכשיו (השיעורים שלו/ה יחויבו אצלו/ה).{' '}
            {dissolves
              ? familyPayments.length
                ? `המשפחה מתפרקת, והתשלומים שלה (${familyPayments.length}) יעברו אל ${others[0].name}.`
                : 'המשפחה מתפרקת.'
              : 'תשלומים קודמים נשארים אצל המשפחה.'}
          </p>
          <div className="flex gap-2">
            <Button variant="danger" className="min-h-9 flex-1 text-sm" disabled={busy} onClick={() => leave().then(() => setConfirmLeave(false))}>
              כן, להוציא
            </Button>
            <Button variant="secondary" className="min-h-9 flex-1 text-sm" disabled={busy} onClick={() => setConfirmLeave(false)}>
              ביטול
            </Button>
          </div>
        </div>
      )}
      {error && <ErrorBox message={error} />}
    </Card>
  )
}
