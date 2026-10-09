import { useState } from 'react'
import { Button, Card, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { endSeries } from '../../data/series'
import type { Series } from '../../data/schema'
import { errorText } from '../../lib/api'
import { DAY_NAMES, formatDate, ils } from '../../lib/format'
import { todayIso } from '../../lib/tz'

export function seriesLabel(sr: Series, typeName?: string) {
  return `כל יום ${DAY_NAMES[sr.weekday]} ב-${sr.start}${typeName ? ` · ${typeName}` : ''}${sr.units > 1 ? ` ×${sr.units}` : ''}`
}

/** "End this weekly lesson" with an inline confirmation. Ends from `fromIso` (default today). */
export function EndSeriesButton({ sr, fromIso, onDone }: { sr: Series; fromIso?: string; onDone?: () => void }) {
  const { db, settings, students, lessonTypes, lessons } = useDb()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const from = fromIso ?? todayIso()
  const future = lessons.filter((l) => l.seriesId === sr.id && l.date >= from && l.status === 'planned').length

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await endSeries({ db, settings, students, lessonTypes }, sr, from, lessons)
      onDone?.()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {confirm ? (
        <>
          <p className="rounded-xl bg-red-50 p-2 text-xs text-red-800">
            {future} שיעורים מתוכננים מ-{formatDate(from)} יבוטלו ויימחקו מהיומן. שיעורים קודמים נשארים.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1 min-h-10 text-sm" disabled={busy} onClick={run}>
              {busy ? 'מסיים…' : 'כן, לסיים'}
            </Button>
            <Button variant="secondary" className="flex-1 min-h-10 text-sm" disabled={busy} onClick={() => setConfirm(false)}>
              ביטול
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" className="min-h-10 w-full text-sm text-red-700" onClick={() => setConfirm(true)}>
          סיום השיעור הקבוע{fromIso ? ' מהשיעור הזה' : ''}
        </Button>
      )}
      {error && <ErrorBox message={error} />}
    </div>
  )
}

export function SeriesList({ studentId }: { studentId: string }) {
  const { series, lessonTypes } = useDb()
  const mine = series.filter((x) => x.studentId === studentId && x.active)
  if (!mine.length) return null
  return (
    <section>
      <h3 className="mb-2 px-1 text-sm font-semibold text-gray-500">שיעורים קבועים</h3>
      <div className="space-y-2">
        {mine.map((sr) => {
          const lt = lessonTypes.find((t) => t.id === sr.lessonTypeId)
          return (
            <Card key={sr.id} className="space-y-2">
              <p className="font-medium">🔁 {seriesLabel(sr, lt?.name)}</p>
              <p className="text-xs text-gray-500">
                מ-{formatDate(sr.startDate)} {sr.endDate ? `עד ${formatDate(sr.endDate)}` : '· ללא תאריך סיום'} · {ils(sr.unitPrice * sr.units)} לשיעור
              </p>
              <EndSeriesButton sr={sr} />
            </Card>
          )
        })}
      </div>
    </section>
  )
}
