import { useState } from 'react'
import { Field } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { invalidateEvents } from '../../data/events'
import { errorText } from '../../lib/api'
import { deleteOwnEvent } from '../../lib/calendar'
import { Section } from './Section'

/**
 * The only hard delete in the app: removes a student and all their lessons
 * from the sheet, plus the Calendar events the app created for them.
 */
export function DeleteTestDataSection() {
  const { db, students, lessons, settings } = useDb()
  const [studentId, setStudentId] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const student = students.find((s) => s.id === studentId)
  const theirLessons = lessons.filter((l) => l.studentId === studentId)
  const withEvents = theirLessons.filter((l) => l.calendarEventId)
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'he'))

  async function run() {
    if (!student) return
    setBusy(true)
    setError(null)
    try {
      let removed = 0
      let kept = 0
      for (const l of withEvents) {
        const r = await deleteOwnEvent(l.calendarId || settings.calendarId, l.calendarEventId)
        if (r === 'ours') removed++
        else if (r === 'foreign') kept++
      }
      await db.hardDeleteStudent(student.id)
      invalidateEvents()
      setDone(
        `נמחקו: ${student.name}, ${theirLessons.length} שיעורים${removed ? `, ${removed} אירועים ביומן` : ''}.` +
          (kept ? ` ${kept} אירועים שלא נוצרו באפליקציה נשארו ביומן.` : ''),
      )
      setStudentId('')
      setSure(false)
    } catch (e) {
      setError(`${errorText(e)} — אפשר לנסות שוב; מה שכבר נמחק לא יימחק פעמיים.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="מחיקת נתוני בדיקה">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          מחיקה לצמיתות של תלמיד וכל השיעורים שלו מהגיליון, וגם של אירועי היומן שהאפליקציה יצרה עבורם. זו המחיקה היחידה באפליקציה — בכל מקום אחר שורות לא נמחקות.
        </p>
        <Field label="תלמיד">
          <select
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value)
              setSure(false)
              setDone(null)
            }}
            className="block min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base"
          >
            <option value="">— בחירה —</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.active ? '' : ' (לא פעיל)'}
              </option>
            ))}
          </select>
        </Field>
        {student && (
          <div className="space-y-3 rounded-xl bg-red-50 p-3 text-sm text-red-900">
            <p>
              יימחקו לצמיתות: <b>{student.name}</b>, {theirLessons.length} שיעורים
              {withEvents.length > 0 && `, ועד ${withEvents.length} אירועים ביומן`}.
            </p>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-5 accent-red-600" checked={sure} onChange={(e) => setSure(e.target.checked)} />
              אני מבין/ה שאי אפשר לשחזר את זה
            </label>
            <Button variant="danger" className="w-full" disabled={!sure || busy} onClick={run}>
              {busy ? 'מוחק…' : 'מחיקה לצמיתות'}
            </Button>
          </div>
        )}
        {done && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">✓ {done}</p>}
        {error && <ErrorBox message={error} />}
      </div>
    </Section>
  )
}
