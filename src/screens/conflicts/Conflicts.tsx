import { useEffect, useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { ErrorBox } from '../../components/ui'
import { useConflicts, type LessonConflict } from '../../data/conflictCheck'
import { useDb } from '../../data/db'
import { dismissConflicts, postponeLesson, refreshFutureLessonEvents, type OpsCtx } from '../../data/lessonOps'
import { topUpSeries } from '../../data/series'
import type { Student } from '../../data/schema'
import { errorText } from '../../lib/api'
import { whatsappLink, whatsappPhone } from '../../lib/contact'
import { DAY_NAMES, formatDate } from '../../lib/format'
import { todayIso, weekdayOf } from '../../lib/tz'
import { migratePaidLessons } from '../../data/payments'
import { BookingForm } from '../booking/BookingForm'

/** Ready-made Hebrew rescheduling message (doesn't reveal what the clash is, except a holiday). */
function rescheduleText(c: LessonConflict, st: Student | undefined) {
  const l = c.lesson
  const first = (st?.name ?? l.studentName).split(' ')[0]
  const hello = st?.parentPhone ? `שלום${st.parentName ? ` ${st.parentName}` : ''},` : `היי ${first},`
  const holiday = c.reasons.find((r) => r.id.startsWith('hol:'))
  const why = holiday ? ` (${holiday.text.replace(/^חג: /, '').replace(/ \(מ-13:00\)$/, '')})` : ''
  return `${hello}\nלגבי השיעור של ${first} ביום ${DAY_NAMES[weekdayOf(l.date)]} ${formatDate(l.date).slice(0, 5)} בשעה ${l.start}${why} — אני צריך/ה לשנות את המועד. אפשר לתאם זמן אחר השבוע? 🙏`
}

function ConflictCard({ c, ctx, onMove }: { c: LessonConflict; ctx: OpsCtx; onMove: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirmPostpone, setConfirmPostpone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const l = c.lesson
  const st = ctx.students.find((s) => s.id === l.studentId)
  const phone = st ? whatsappPhone(st) : ''

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 rounded-2xl bg-white p-3 shadow-sm">
      <div>
        <p className="font-semibold">
          {ctx.lessonTypes.find((t) => t.id === l.lessonTypeId)?.isZoom ? '💻' : '🏠'} {l.studentName} · יום {DAY_NAMES[weekdayOf(l.date)]} {formatDate(l.date).slice(0, 5)} · <span dir="ltr">{l.start}-{l.end}</span>
        </p>
        <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
          {c.reasons.map((r) => (
            <li key={r.id}>⚠️ {r.text}</li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-sm">
        <button disabled={busy} onClick={onMove} className="min-h-10 rounded-lg bg-brand-700 font-medium text-white">
          הזז
        </button>
        {confirmPostpone ? (
          <button disabled={busy} onClick={() => run(() => postponeLesson(ctx, l))} className="min-h-10 rounded-lg bg-red-600 font-medium text-white">
            {busy ? '…' : 'לדחות?'}
          </button>
        ) : (
          <button disabled={busy} onClick={() => setConfirmPostpone(true)} className="min-h-10 rounded-lg bg-gray-100 font-medium">
            דחה
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => run(() => dismissConflicts(ctx, l, c.reasons.map((r) => r.id)))}
          className="min-h-10 rounded-lg bg-gray-100 font-medium"
        >
          השאר
        </button>
        {phone ? (
          <a
            href={whatsappLink(phone, rescheduleText(c, st))}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center justify-center rounded-lg bg-green-600 font-medium text-white"
          >
            וואטסאפ
          </a>
        ) : (
          <span className="flex min-h-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">וואטסאפ</span>
        )}
      </div>
      {confirmPostpone && !busy && (
        <p className="text-xs text-gray-500">"דחה" מסמן את השיעור כנדחה, מוחק אותו מהיומן ולא סופר אותו בהכנסות.</p>
      )}
      {error && <ErrorBox message={error} />}
    </li>
  )
}

/** Banner "⚠️ X שיעורים מתנגשים" + the list. Shown at the top of every screen. */
export function ConflictsBanner() {
  const { db, settings, students, lessonTypes, lessons } = useDb()
  const { conflicts, holidaySource, holidayError } = useConflicts()
  const [open, setOpen] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const ctx: OpsCtx = { db, settings, students, lessonTypes }
  const moving = lessons.find((l) => l.id === movingId)

  if (!conflicts?.length && !open) return null
  return (
    <>
      {!!conflicts?.length && (
        <button
          onClick={() => setOpen(true)}
          className="pt-safe w-full shrink-0 bg-amber-100 px-4 py-2 text-start text-sm font-semibold text-amber-900"
        >
          ⚠️ {conflicts.length === 1 ? 'שיעור אחד מתנגש' : `${conflicts.length} שיעורים מתנגשים`} — הצגה
        </button>
      )}
      <Overlay open={open} title="שיעורים מתנגשים (4 השבועות הקרובים)" onClose={() => setOpen(false)}>
        {!conflicts?.length ? (
          <p className="rounded-2xl bg-white p-4 text-center text-green-700">✓ אין התנגשויות</p>
        ) : (
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <ConflictCard key={c.lesson.id} c={c} ctx={ctx} onMove={() => setMovingId(c.lesson.id)} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-center text-xs text-gray-400">
          {holidayError ? 'לא ניתן היה לבדוק חגים כרגע' : holidaySource ? `חגים: ${holidaySource}` : 'בודק חגים…'}
        </p>
        {moving && <BookingForm init={{ mode: 'edit', lesson: moving }} onClose={() => setMovingId(null)} onChain={() => {}} />}
      </Overlay>
    </>
  )
}

/** Current lesson-title format ("💻 זום – …" / "🏠 … – פרונטלי"). */
const EVENT_TITLE_VERSION = 2
let maintained = false

/**
 * Runs once each time the app opens: keeps weekly series filled 8 weeks ahead,
 * and (once per title-format change) rewrites future lesson event titles.
 */
export function SeriesKeeper() {
  const { db, settings, students, lessonTypes, lessons, series } = useDb()
  const [notice, setNotice] = useState<string | null>(null)
  const addNotice = (text: string) => setNotice((prev) => (prev ? `${prev}
${text}` : text))
  useEffect(() => {
    if (maintained) return
    maintained = true
    const ctx: OpsCtx = { db, settings, students, lessonTypes }
    ;(async () => {
      // Stage 6: the old per-lesson "paid" marks become payments (once; safe on two devices).
      if (!db.snapshot.settings.paymentsMigrated) {
        const n = await migratePaidLessons(db)
        if (n) addNotice(`${n} שיעורים שסומנו "שולם" הועברו לתשלומים — היתרות מחושבות מעכשיו לפי תשלומים.`)
      }
      // Title fix first, so the count covers only events that existed in the old format.
      if (settings.eventTitleVersion < EVENT_TITLE_VERSION) {
        const n = await refreshFutureLessonEvents(ctx, lessons, todayIso())
        await db.saveSettings({ ...db.snapshot.settings, eventTitleVersion: EVENT_TITLE_VERSION })
        if (n) addNotice(`כותרות השיעורים ביומן עודכנו לפורמט החדש (💻 זום / 🏠 פרונטלי): ${n} אירועים עודכנו.`)
      }
      await topUpSeries(ctx, series, db.snapshot.lessons)
    })().catch(() => {
      maintained = false // try again next time
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!notice) return null
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-900 shadow-lg">
      <p className="flex-1 whitespace-pre-line">✓ {notice}</p>
      <button aria-label="סגירה" onClick={() => setNotice(null)} className="text-lg leading-none">
        ×
      </button>
    </div>
  )
}
