import { useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { Button, Card, ErrorBox } from '../components/ui'
import { useDb } from '../data/db'
import { cancelLesson, setLessonFlags, type OpsCtx } from '../data/lessonOps'
import { EVENT_COLORS, isLive, type Lesson } from '../data/schema'
import { addMonths, byStudent, byType, incomeByMonth, monthLabel, monthOf, monthsWithData, monthTotals, type BreakdownRow } from '../data/summary'
import { errorText } from '../lib/api'
import { exportMonth } from '../lib/excel'
import { DAY_SHORT, formatDate, ils } from '../lib/format'
import { addDays, utcToZoned, weekdayOf } from '../lib/tz'
import { BookingForm, type BookingInit } from './booking/BookingForm'
import { IncomeChart } from './summary/IncomeChart'

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <Card className={tone === 'warn' ? 'bg-amber-50' : ''}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${tone === 'good' ? 'text-green-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</div>
    </Card>
  )
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  if (!rows.length) return null
  return (
    <Card className="p-0">
      <h3 className="px-4 pb-1 pt-3 text-sm font-semibold text-gray-500">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-400">
          <tr>
            <th className="px-4 py-1 text-start font-normal"></th>
            <th className="px-2 py-1 text-end font-normal">שיעורים</th>
            <th className="px-2 py-1 text-end font-normal">הכנסה</th>
            <th className="px-4 py-1 text-end font-normal">לא שולם</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2">
                  {r.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
                  {r.name}
                </span>
              </td>
              <td className="px-2 py-2 text-end tabular-nums">{r.units}</td>
              <td className="px-2 py-2 text-end tabular-nums">{ils(r.income)}</td>
              <td className={`px-4 py-2 text-end tabular-nums ${r.unpaid ? 'font-medium text-amber-700' : 'text-gray-400'}`}>{r.unpaid ? ils(r.unpaid) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Chip({ on, onClick, children, disabled, tone = 'green' }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; tone?: 'green' | 'red' }) {
  const onCls = tone === 'red' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`min-h-9 rounded-lg px-2.5 text-xs font-medium ${on ? onCls : 'bg-gray-100 text-gray-600'} disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

function LessonRow({ l, ctx, nowIso, onEdit }: { l: Lesson; ctx: OpsCtx; nowIso: string; onEdit: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const type = ctx.lessonTypes.find((t) => t.id === l.lessonTypeId)
  const live = isLive(l)
  // A lesson whose time has passed but is still "planned" — needs confirming.
  const needsConfirm = l.status === 'planned' && (l.date < nowIso.slice(0, 10) || (l.date === nowIso.slice(0, 10) && l.end <= nowIso.slice(11)))

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  return (
    <li className={`px-3 py-2.5 ${needsConfirm ? 'bg-amber-50' : ''} ${live ? '' : 'opacity-60'}`}>
      <button type="button" onClick={onEdit} disabled={!live} className="flex w-full items-center gap-2 text-start">
        <span className="w-12 shrink-0 text-center leading-tight">
          <span className="block text-xs text-gray-500">{DAY_SHORT[weekdayOf(l.date)]}</span>
          <span className="block font-semibold">{formatDate(l.date).slice(0, 5)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-medium ${live ? '' : 'line-through'}`}>{l.studentName}</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="size-2 shrink-0 rounded-full" style={{ background: EVENT_COLORS[type?.color ?? '']?.hex ?? '#94a3b8' }} />
            <span dir="ltr">{l.start}</span> · {type?.name ?? '—'}
            {l.units > 1 && ` ×${l.units}`}
          </span>
        </span>
        <span className={`shrink-0 font-semibold tabular-nums ${live ? '' : 'text-gray-400 line-through'}`}>{ils(l.price)}</span>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 ps-14">
        {live ? (
          <>
            <Chip on={l.status === 'done'} disabled={busy} onClick={() => run(() => setLessonFlags(ctx, l, { status: l.status === 'done' ? 'planned' : 'done' }))}>
              {l.status === 'done' ? '✓ התקיים' : needsConfirm ? 'אישור שהתקיים' : 'התקיים'}
            </Chip>
            <Chip on={l.paid} disabled={busy} onClick={() => run(() => setLessonFlags(ctx, l, { paid: !l.paid }))}>
              {l.paid ? '✓ שולם' : 'שולם'}
            </Chip>
            {confirmCancel ? (
              <Chip on tone="red" disabled={busy} onClick={() => run(() => cancelLesson(ctx, l))}>
                {busy ? '…' : 'לבטל?'}
              </Chip>
            ) : (
              <Chip on={false} disabled={busy} onClick={() => setConfirmCancel(true)}>
                בוטל
              </Chip>
            )}
            {needsConfirm && <span className="text-xs text-amber-700">עבר ועדיין מתוכנן</span>}
          </>
        ) : (
          <>
            <span className="text-xs text-gray-500">{l.status === 'postponed' ? 'נדחה' : 'בוטל'}</span>
            <Chip on={false} disabled={busy} onClick={() => run(() => setLessonFlags(ctx, l, { status: 'planned' }))}>
              שחזור
            </Chip>
          </>
        )}
      </div>
      {error && (
        <div className="mt-2">
          <ErrorBox message={error} />
        </div>
      )}
    </li>
  )
}

export function SummaryScreen() {
  const { db, settings, students, lessonTypes, lessons } = useDb()
  const now = utcToZoned(new Date())
  const nowIso = `${now.iso}T${String(Math.floor(now.min / 60)).padStart(2, '0')}:${String(now.min % 60).padStart(2, '0')}`
  const currentYm = monthOf(now.iso)
  const [ym, setYm] = useState(currentYm)
  const [booking, setBooking] = useState<{ init: BookingInit; key: number } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const ctx: OpsCtx = { db, settings, students, lessonTypes }

  const months = useMemo(() => monthsWithData(lessons, currentYm), [lessons, currentYm])
  const totals = useMemo(() => monthTotals(lessons, ym), [lessons, ym])
  const typeRows = useMemo(() => byType(lessons, ym, lessonTypes), [lessons, ym, lessonTypes])
  const studentRows = useMemo(() => byStudent(lessons, ym), [lessons, ym])
  const chart = useMemo(() => incomeByMonth(lessons, ym > currentYm ? ym : currentYm, 6), [lessons, ym, currentYm])
  const monthLessons = useMemo(
    () => lessons.filter((l) => monthOf(l.date) === ym).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [lessons, ym],
  )
  const toConfirm = monthLessons.filter(
    (l) => l.status === 'planned' && (l.date < now.iso || (l.date === now.iso && l.end <= nowIso.slice(11))),
  )

  async function doExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportMonth(lessons, ym, lessonTypes)
    } catch (e) {
      setExportError(errorText(e))
    } finally {
      setExporting(false)
    }
  }

  async function confirmAll() {
    setBulkBusy(true)
    try {
      await db.upsert('Lessons', toConfirm.map((l) => ({ ...l, status: 'done' as const })))
    } finally {
      setBulkBusy(false)
    }
  }

  // "+ שיעור שהתקיים": today in the current month, otherwise the month's last day.
  const pastLessonDate = ym === currentYm ? now.iso : ym < currentYm ? addDays(`${addMonths(ym, 1)}-01`, -1) : `${ym}-01`

  return (
    <Page
      title="סיכום חודשי"
      actions={
        <Button variant="secondary" className="min-h-10 px-3 text-sm" disabled={exporting} onClick={doExport}>
          {exporting ? 'מייצא…' : '⬇ ייצוא לאקסל'}
        </Button>
      }
    >
      {/* month picker */}
      <div className="mb-3 flex items-center gap-1">
        <button aria-label="חודש קודם" onClick={() => setYm(addMonths(ym, -1))} className="flex size-10 items-center justify-center rounded-full text-xl active:bg-gray-200">
          ›
        </button>
        <select
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          aria-label="בחירת חודש"
          className="min-h-10 flex-1 rounded-xl border border-gray-300 bg-white px-3 text-center text-lg font-semibold"
        >
          {[...new Set([ym, ...months])].sort().reverse().map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <button aria-label="חודש הבא" onClick={() => setYm(addMonths(ym, 1))} className="flex size-10 items-center justify-center rounded-full text-xl active:bg-gray-200">
          ‹
        </button>
        {ym !== currentYm && (
          <button onClick={() => setYm(currentYm)} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-brand-700 shadow-sm">
            החודש
          </button>
        )}
      </div>
      {exportError && (
        <div className="mb-3">
          <ErrorBox message={`הייצוא נכשל: ${exportError}`} />
        </div>
      )}

      {/* cards */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="שיעורים שהתקיימו" value={`${totals.doneUnits}${totals.liveUnits > totals.doneUnits ? ` מתוך ${totals.liveUnits}` : ''}`} />
        <Stat label="הכנסה צפויה" value={ils(totals.expected)} />
        <Stat label="שולם" value={ils(totals.paid)} tone="good" />
        <Stat label="לא שולם" value={ils(totals.unpaid)} tone={totals.unpaid > 0 ? 'warn' : undefined} />
      </div>
      <p className="mt-1 px-1 text-xs text-gray-500">שיעורים כפולים נספרים לפי כמות (×2 = 2). שיעורים שבוטלו או נדחו לא נספרים.</p>

      {/* past lessons still "planned" */}
      {toConfirm.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex-1">
            {toConfirm.length === 1 ? 'שיעור אחד שעבר' : `${toConfirm.length} שיעורים שעברו`} עדיין {toConfirm.length === 1 ? 'מסומן' : 'מסומנים'} "מתוכנן" (מודגשים למטה).
          </span>
          <Button className="min-h-9 px-3 text-sm" disabled={bulkBusy} onClick={confirmAll}>
            {bulkBusy ? '…' : 'סמן הכל כהתקיים'}
          </Button>
        </div>
      )}

      {/* income chart */}
      <Card className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-500">הכנסה לפי חודש</h3>
        <IncomeChart data={chart} selected={ym} onSelect={setYm} />
      </Card>

      {/* breakdowns */}
      <div className="mt-4 space-y-3">
        <Breakdown title="לפי סוג שיעור" rows={typeRows} />
        <Breakdown title="לפי תלמיד" rows={studentRows} />
      </div>

      {/* lessons table */}
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-gray-500">כל השיעורים ({monthLessons.length})</h3>
          <button
            onClick={() => setBooking({ init: { mode: 'new', iso: pastLessonDate, start: null }, key: Date.now() })}
            className="text-sm font-medium text-brand-700"
          >
            + שיעור שהתקיים
          </button>
        </div>
        {monthLessons.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-gray-500">אין שיעורים בחודש הזה.</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-gray-100">
              {monthLessons.map((l) => (
                <LessonRow
                  key={l.id}
                  l={l}
                  ctx={ctx}
                  nowIso={nowIso}
                  onEdit={() => setBooking({ init: { mode: 'edit', lesson: l }, key: Date.now() })}
                />
              ))}
            </ul>
          </Card>
        )}
        <p className="mt-1 px-1 text-xs text-gray-500">לחיצה על שיעור פותחת עריכה (סוג, מחיר, זמן) — האירוע ביומן מתעדכן בהתאם.</p>
      </section>

      {booking && (
        <BookingForm
          key={booking.key}
          init={booking.init}
          onClose={() => setBooking(null)}
          onChain={(iso, start) => setBooking({ init: { mode: 'new', iso, start, chain: true }, key: Date.now() })}
        />
      )}
    </Page>
  )
}

