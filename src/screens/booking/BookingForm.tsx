import { useEffect, useMemo, useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { Field, TextArea, TextInput, Toggle } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { findWarnings, type Warning } from '../../data/conflicts'
import { useDb } from '../../data/db'
import { cachedLoad, type EventsByDay } from '../../data/events'
import { createLessons, updateLesson, type OpsCtx } from '../../data/lessonOps'
import { createSeries, HORIZON_DAYS } from '../../data/series'
import { balanceText, toCollect } from '../../data/billing'
import { useBilling } from '../../data/payments'
import { placeKey } from '../../data/plan'
import { EVENT_COLORS, detailsMissing, isLive, newId, normalizeStudentTypes, type Lesson, type LessonType, type Student } from '../../data/schema'
import { errorText } from '../../lib/api'
import { DAY_NAMES, formatDate, ils } from '../../lib/format'
import { fromMin, toMin } from '../../lib/time'
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from '../../lib/tz'
import { MissingTag } from '../students/StudentCard'
import { blankStudent, StudentForm, trimStudent } from '../students/StudentForm'

export type BookingInit =
  | {
      mode: 'new'
      iso: string
      start: number | null // null = let the user pick (e.g. "+ שיעור שהתקיים")
      adjacent?: { place: string; nextTo: string } // opened from a dashed "צמוד" slot
      chain?: boolean // "+ שיעור צמוד": back-to-back on purpose, no break check
    }
  | { mode: 'edit'; lesson: Lesson }

const UNITS = [1, 2, 3] as const

function TypeButton({ t, on, onClick }: { t: LessonType; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-start ${
        on ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white'
      }`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <span className="size-3 shrink-0 rounded-full" style={{ background: EVENT_COLORS[t.color]?.hex }} />
        {t.name}
      </span>
      <span className="text-xs text-gray-500">
        {t.durationMin} דק׳ · {ils(t.price)}
      </span>
    </button>
  )
}

function WarningList({ items, prefix }: { items: Warning[]; prefix?: string }) {
  if (!items.length) return null
  return (
    <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
      {items.map((w, i) => (
        <li key={i} className={w.kind === 'rule' ? 'font-semibold text-orange-800' : ''}>
          {w.kind === 'hours' ? 'ℹ️' : '⚠️'} {prefix}
          {w.text}
        </li>
      ))}
    </ul>
  )
}

export function BookingForm({
  init,
  onClose,
  onChain,
}: {
  init: BookingInit
  onClose: () => void
  /** "+ שיעור צמוד": open a new booking right when this lesson ends. */
  onChain: (iso: string, start: number) => void
}) {
  const { db, settings, students, lessonTypes, lessons } = useDb()
  const editing = init.mode === 'edit' ? init.lesson : null

  // ---- form state (kept while re-logging in: this component stays mounted) ----
  const [studentId, setStudentId] = useState(editing?.studentId ?? '')
  const [query, setQuery] = useState(editing?.studentName ?? '')
  const [listOpen, setListOpen] = useState(false)
  const [newMode, setNewMode] = useState(false) // picked "+ תלמיד חדש: <name>"
  // After saving with a new student: their full details window (name + type prefilled).
  const [completeStudent, setCompleteStudent] = useState<Student | null>(null)
  const [typeId, setTypeId] = useState(editing?.lessonTypeId ?? '')
  const [showOther, setShowOther] = useState(false)
  const [units, setUnits] = useState(editing?.units ?? 1)
  const [unitPrice, setUnitPrice] = useState<string>(editing ? String(editing.price / (editing.units || 1)) : '')
  const [date, setDate] = useState(editing?.date ?? (init.mode === 'new' ? init.iso : ''))
  const [start, setStart] = useState(editing?.start ?? (init.mode === 'new' && init.start !== null ? fromMin(init.start) : ''))
  const [repeat, setRepeat] = useState(false)
  const [seriesEnd, setSeriesEnd] = useState('') // '' = open-ended
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [alsoCalendar, setAlsoCalendar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ lessons: Lesson[]; note: string | null } | null>(null)

  const student = students.find((s) => s.id === studentId)
  const { payerOfStudent, balanceOf } = useBilling()
  const payer = payerOfStudent(student)
  const payerBalance = payer ? balanceOf(payer.id).balance : 0
  // Editing a lesson that's already done: its old charge is in the balance — take it out first.
  const balanceBeforeLesson = payerBalance + (editing?.status === 'done' ? editing.price : 0)
  const isNewStudent = !student && newMode && query.trim() !== ''
  const type = lessonTypes.find((t) => t.id === typeId)

  function onQuery(q: string) {
    setQuery(q)
    setListOpen(true)
    setStudentId('')
    setNewMode(false)
  }

  function pickStudent(s: Student) {
    setStudentId(s.id)
    setNewMode(false)
    setQuery(s.name)
    setListOpen(false)
    if (!editing) {
      const t = lessonTypes.find((x) => x.id === s.defaultLessonTypeId) ?? lessonTypes.find((x) => s.allowedLessonTypeIds.includes(x.id))
      if (t) pickType(t)
    }
  }

  function pickType(t: LessonType) {
    setTypeId(t.id)
    setUnitPrice(String(t.price)) // changing the type updates the price
  }

  // All active students: most recently booked first, then A–Z. Typing filters.
  const ordered = useMemo(() => {
    const last = new Map<string, string>()
    for (const l of lessons) {
      if (!isLive(l)) continue
      const k = l.date + l.start
      if (k > (last.get(l.studentId) ?? '')) last.set(l.studentId, k)
    }
    return students
      .filter((s) => s.active)
      .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name, 'he'))
  }, [students, lessons])
  // While a student (or "new") is picked the field shows that name; tapping it again lists everyone.
  const filter = student || newMode ? '' : query.trim().toLowerCase()
  const matches = filter ? ordered.filter((s) => s.name.toLowerCase().includes(filter)) : ordered
  const offerNew = filter !== '' && matches.length === 0
  const typesOf = (s: Student) =>
    [s.defaultLessonTypeId, ...s.allowedLessonTypeIds.filter((id) => id !== s.defaultLessonTypeId)]
      .map((id) => lessonTypes.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(' + ')

  // Student's own types as big buttons; everything else under "סוג אחר".
  const activeTypes = lessonTypes.filter((t) => t.active || t.id === typeId)
  const mainTypes = student
    ? activeTypes.filter((t) => student.allowedLessonTypeIds.includes(t.id) || t.id === typeId)
    : activeTypes
  const otherTypes = student ? activeTypes.filter((t) => !mainTypes.includes(t)) : []

  // ---- derived time / price ----
  const startMin = /^\d{2}:\d{2}$/.test(start) ? toMin(start) : null
  const duration = (type?.durationMin ?? 0) * units
  const endMin = startMin !== null ? startMin + duration : null
  const priceNum = unitPrice.trim() === '' ? NaN : Number(unitPrice)
  const total = Number.isFinite(priceNum) ? priceNum * units : 0
  const isPast = startMin !== null && date !== '' && zonedToUtc(date, startMin) < new Date()
  const canRepeat = !editing && !isPast

  // A weekly series is created up to 8 weeks ahead (topped up later when the app opens).
  const dates = useMemo(() => {
    if (!date) return []
    if (!(repeat && canRepeat)) return [date]
    const out: string[] = []
    for (let d = date; d <= addDays(date, HORIZON_DAYS) && (!seriesEnd || d <= seriesEnd); d = addDays(d, 7)) out.push(d)
    return out
  }, [date, repeat, canRepeat, seriesEnd])

  // ---- calendar events for the overlap check (cached, any date) ----
  const [events, setEvents] = useState<EventsByDay | null>(null)
  const span = dates.length ? 7 * (dates.length - 1) + 1 : 0
  useEffect(() => {
    if (!date || !span) return
    let cancelled = false
    cachedLoad(date, span, settings.calendarVisibility, settings.calendarId).then(
      (r) => !cancelled && setEvents(r.days),
      () => !cancelled && setEvents(null), // warnings are best-effort
    )
    return () => {
      cancelled = true
    }
  }, [date, span, settings.calendarVisibility, settings.calendarId])

  const place = placeKey(!!type?.isZoom, student?.address ?? '')
  const warnings = useMemo(() => {
    if (startMin === null || endMin === null || !type) return []
    return dates.map((iso) => ({
      iso,
      list: findWarnings({
        iso, start: startMin, end: endMin, place, events, lessons, students, lessonTypes, settings,
        ignoreLessonId: editing?.id,
        noBreakCheck: init.mode === 'new' && init.chain,
      }),
    }))
  }, [dates, startMin, endMin, type, place, events, lessons, students, lessonTypes, settings, editing?.id, init])

  // ---- validation ----
  const problems: string[] = []
  if (!student && !isNewStudent) problems.push(query.trim() ? 'יש לבחור תלמיד מהרשימה' : 'יש לבחור תלמיד')
  if (!type) problems.push('יש לבחור סוג שיעור')
  if (!date) problems.push('יש לבחור תאריך')
  if (startMin === null) problems.push('יש לבחור שעה')
  if (endMin !== null && endMin > 24 * 60) problems.push('השיעור חייב להסתיים עד חצות')
  if (!Number.isFinite(priceNum) || priceNum < 0) problems.push('יש להזין מחיר')

  const willHaveEvent = editing ? !!editing.calendarEventId || alsoCalendar : !isPast || alsoCalendar

  async function save() {
    if (problems.length || !type || startMin === null || endMin === null) return
    setSaving(true)
    setError(null)
    try {
      const ctx: OpsCtx = { db, settings, students, lessonTypes }
      let st = student
      if (!st) {
        // New student: saved with the chosen type as their (only) type.
        // New student: saved now with just the name and type; the details window follows.
        st = normalizeStudentTypes(
          trimStudent({ ...blankStudent(query.trim()), id: newId('st'), allowedLessonTypeIds: [type.id], defaultLessonTypeId: type.id }),
        )
        await db.upsert('Students', [st])
        ctx.students = [...students, st]
        setStudentId(st.id)
        setNewMode(false)
      }
      const createdStudent = student ? null : st
      const base = {
        start: fromMin(startMin),
        end: fromMin(endMin),
        studentId: st.id,
        studentName: st.name,
        lessonTypeId: type.id,
        price: total,
        units,
        notes: notes.trim(),
      }
      if (editing) {
        const note = await updateLesson(ctx, { ...editing, ...base, date }, alsoCalendar)
        if (note) setSaved({ lessons: [{ ...editing, ...base, date }], note })
        else onClose()
        return
      }
      const first: Lesson = {
        ...base,
        id: newId('ls'),
        date,
        status: isPast ? 'done' : 'planned',
        paid: false,
        calendarEventId: '',
        calendarId: '',
        seriesId: '',
        seriesDate: '',
        dismissed: [],
      }
      const out =
        repeat && canRepeat
          ? await createSeries(ctx, first, priceNum, seriesEnd)
          : await createLessons(ctx, [first], willHaveEvent)
      setSaved({ lessons: out, note: null })
      if (createdStudent) setCompleteStudent(createdStudent)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  // ---- after saving: summary + "+ שיעור צמוד" ----
  if (saved) {
    const first = saved.lessons[0]
    return (
      <Overlay
        open
        title={editing ? 'השיעור עודכן' : 'השיעור נשמר'}
        onClose={onClose}
        footer={
          <div className="flex gap-2">
            {!editing && first && toMin(first.end) < 24 * 60 && (
              <Button className="flex-1" onClick={() => onChain(first.date, toMin(first.end))}>
                + שיעור צמוד
              </Button>
            )}
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              סגירה
            </Button>
          </div>
        }
      >
        <div className="space-y-3 rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold text-green-700">✓ {saved.lessons.length > 1 ? `${saved.lessons.length} שיעורים נשמרו` : 'נשמר'}</p>
          <ul className="space-y-1 text-sm">
            {saved.lessons.map((l) => (
              <li key={l.id}>
                {l.studentName} · יום {DAY_NAMES[weekdayOf(l.date)]} {formatDate(l.date)} ·{' '}
                <span dir="ltr">{l.start}-{l.end}</span>
                {l.units > 1 && ` · ×${l.units}`} · {ils(l.price)}
                {l.status === 'done' && ' · התקיים'}
                {!l.calendarEventId && ' · בגיליון בלבד'}
              </li>
            ))}
          </ul>
          {saved.note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{saved.note}</p>}
          {!editing && <p className="text-xs text-gray-500">"+ שיעור צמוד" פותח שיעור לתלמיד נוסף שמתחיל בדיוק כשהשיעור הזה נגמר, ללא הפסקה.</p>}
        </div>
        {completeStudent && (
          <StudentForm
            initial={completeStudent}
            title={`פרטי תלמיד חדש: ${completeStudent.name}`}
            onClose={() => setCompleteStudent(null)}
            onSaved={async (st) => {
              // Put the new address / building code / phone into the lesson events just created.
              const ctx: OpsCtx = { db, settings, students: [...students.filter((x) => x.id !== st.id), st], lessonTypes }
              const updated = saved.lessons.map((l) => ({ ...l, studentName: st.name }))
              const notes = await Promise.all(updated.filter((l) => l.calendarEventId).map((l) => updateLesson(ctx, l)))
              if (!updated.every((l) => l.calendarEventId)) await db.upsert('Lessons', updated.filter((l) => !l.calendarEventId))
              setSaved({ lessons: updated, note: notes.find(Boolean) ?? null })
            }}
          />
        )}
      </Overlay>
    )
  }

  const nowZ = utcToZoned(new Date())
  const allWarnings = warnings.filter((w) => w.list.length)

  return (
    <Overlay
      open
      title={editing ? `עריכת שיעור – ${editing.studentName}` : init.mode === 'new' && init.chain ? 'שיעור צמוד' : 'קביעת שיעור'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {problems.length > 0 && <p className="text-center text-xs text-gray-500">{problems[0]}</p>}
          <Button className="w-full" disabled={problems.length > 0 || saving} onClick={save}>
            {saving
              ? 'שומר…'
              : editing
                ? 'שמירת שינויים'
                : `שמירה${dates.length > 1 ? ` (${dates.length} שיעורים)` : ''}${total ? ` · ${ils(total * dates.length)}` : ''}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {init.mode === 'new' && init.chain && (
          <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">שיעור צמוד — מתחיל מיד בסיום השיעור הקודם, ללא הפסקה.</p>
        )}
        {init.mode === 'new' && init.adjacent && (
          <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
            שעה צמודה לשיעור של {init.adjacent.nextTo} — מתאים ל{init.adjacent.place === 'zoom' ? 'שיעור זום' : 'תלמיד באותה כתובת'}.
          </p>
        )}

        {/* student */}
        <div className="relative">
          <Field label="תלמיד">
            <TextInput
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onFocus={() => setListOpen(true)}
              onBlur={() => setTimeout(() => setListOpen(false), 150)}
              placeholder="בחירה מהרשימה או הקלדת שם"
              autoComplete="off"
            />
          </Field>
          {listOpen && (matches.length > 0 || offerNew) && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickStudent(s)}
                    className={`block w-full px-3 py-2.5 text-start active:bg-gray-50 ${s.id === studentId ? 'bg-brand-50' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      {s.name}
                      {detailsMissing(s) && <MissingTag />}
                    </span>
                    <span className="block text-xs text-gray-500">{typesOf(s) || '—'}</span>
                  </button>
                </li>
              ))}
              {offerNew && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setNewMode(true)
                      setListOpen(false)
                    }}
                    className="block w-full px-3 py-2.5 text-start font-medium text-brand-700 active:bg-gray-50"
                  >
                    + תלמיד חדש: {query.trim()}
                  </button>
                </li>
              )}
            </ul>
          )}
          {student && (
            <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-gray-600">
              {[student.address, student.buildingCode && `קוד ${student.buildingCode}`, student.floorApt && `קומה/דירה ${student.floorApt}`]
                .filter(Boolean)
                .join(' · ') || 'אין כתובת'}
              {student.zoomLink && <span className="block truncate" dir="ltr">{student.zoomLink}</span>}
            </div>
          )}
          {isNewStudent && (
            <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
              תלמיד חדש — אחרי שמירת השיעור ייפתח חלון להשלמת הפרטים (טלפון, כתובת, הורה…).
            </p>
          )}
        </div>

        {/* lesson type */}
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">סוג שיעור</span>
          {lessonTypes.length === 0 ? (
            <p className="text-sm text-gray-500">אין סוגי שיעור — יש להוסיף בהגדרות.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {mainTypes.map((t) => (
                <TypeButton key={t.id} t={t} on={typeId === t.id} onClick={() => pickType(t)} />
              ))}
              {showOther && otherTypes.map((t) => <TypeButton key={t.id} t={t} on={typeId === t.id} onClick={() => pickType(t)} />)}
            </div>
          )}
          {otherTypes.length > 0 && !showOther && (
            <button type="button" onClick={() => setShowOther(true)} className="mt-1 py-1 text-sm text-brand-700">
              סוג אחר ▾
            </button>
          )}
        </div>

        {/* quantity + price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">כמות</span>
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-gray-300 bg-white">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={units === u}
                  onClick={() => setUnits(u)}
                  className={`min-h-11 font-semibold ${units === u ? 'bg-brand-700 text-white' : 'text-gray-700'}`}
                >
                  ×{u}
                </button>
              ))}
            </div>
          </div>
          <Field label="מחיר לשיעור (₪)" hint={units > 1 ? `סה״כ ${ils(total)}` : undefined}>
            <TextInput type="number" inputMode="decimal" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
        </div>

        {/* what to collect: price minus the payer's credit */}
        {student && type && Number.isFinite(priceNum) && (
          <p className="-mt-2 rounded-xl bg-white px-3 py-2 text-sm">
            {payer?.paysMonthly ? (
              <span className="text-gray-600">משלם בסוף חודש · {balanceText(payerBalance, ils)}</span>
            ) : (
              <>
                <b>לגבות היום: {ils(toCollect({ status: 'planned', price: total }, balanceBeforeLesson))}</b>
                {payerBalance !== 0 && <span className="text-gray-500"> · {balanceText(payerBalance, ils)}</span>}
              </>
            )}
          </p>
        )}

        {/* date + time (manual) */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="תאריך" hint={date ? `יום ${DAY_NAMES[weekdayOf(date)]}` : undefined}>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="שעת התחלה" hint={endMin !== null && type ? `עד ${fromMin(Math.min(endMin, 24 * 60 - 1))} · ${duration} דק׳` : undefined}>
            <TextInput type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        {date && date !== nowZ.iso && (
          <button type="button" onClick={() => setDate(nowZ.iso)} className="-mt-3 text-sm text-brand-700">
            היום
          </button>
        )}

        {/* past lesson / calendar */}
        {isPast && !editing && (
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <p>השעה עברה — השיעור יישמר כ"התקיים", בגיליון בלבד.</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" className="size-5 accent-brand-700" checked={alsoCalendar} onChange={(e) => setAlsoCalendar(e.target.checked)} />
              גם ליומן
            </label>
          </div>
        )}
        {editing && !editing.calendarEventId && (
          <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm">
            <input type="checkbox" className="size-5 accent-brand-700" checked={alsoCalendar} onChange={(e) => setAlsoCalendar(e.target.checked)} />
            גם ליומן (השיעור שמור כרגע בגיליון בלבד)
          </label>
        )}

        {/* repeat weekly */}
        {canRepeat && (
          <div className="rounded-xl bg-white px-3">
            <Toggle
              label="שיעור קבוע כל שבוע"
              hint={repeat && date ? `כל יום ${DAY_NAMES[weekdayOf(date)]} ב-${start || '…'} · שיעורים נוצרים 8 שבועות קדימה ומתמלאים אוטומטית` : undefined}
              checked={repeat}
              onChange={setRepeat}
            />
            {repeat && (
              <div className="flex flex-wrap items-center gap-2 pb-3 text-sm">
                <span>עד תאריך</span>
                <TextInput type="date" value={seriesEnd} min={date} className="!w-auto" onChange={(e) => setSeriesEnd(e.target.value)} />
                {seriesEnd ? (
                  <button type="button" onClick={() => setSeriesEnd('')} className="text-brand-700">ללא סיום</button>
                ) : (
                  <span className="text-gray-500">(ללא תאריך סיום)</span>
                )}
              </div>
            )}
          </div>
        )}

        <Field label="הערות לשיעור">
          <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {/* warnings (never block saving) */}
        {allWarnings.map((w) => (
          <WarningList key={w.iso} items={w.list} prefix={dates.length > 1 ? `${formatDate(w.iso).slice(0, 5)}: ` : ''} />
        ))}

        {error && <ErrorBox message={`השמירה נכשלה. ${error}`} />}
      </div>
    </Overlay>
  )
}
