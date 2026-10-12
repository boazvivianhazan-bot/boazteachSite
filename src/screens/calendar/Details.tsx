import { useState, type ReactNode } from 'react'
import { Overlay } from '../../components/Overlay'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { cancelLesson } from '../../data/lessonOps'
import { CollectPanel } from '../payments/CollectPanel'
import { errorText } from '../../lib/api'
import type { CalEvent } from '../../data/events'
import { EVENT_COLORS, isLive, matchRule, type Lesson } from '../../data/schema'
import { textOn } from './Timeline'
import { EndSeriesButton, seriesLabel } from '../students/SeriesList'
import { wazeLink } from '../../lib/contact'
import { DAY_NAMES, formatDate, ils } from '../../lib/format'
import { fromMin } from '../../lib/time'
import { weekdayOf } from '../../lib/tz'

const dayLabel = (iso: string) => `יום ${DAY_NAMES[weekdayOf(iso)]}, ${formatDate(iso)}`

/** Google descriptions may contain HTML: show it as plain text with clickable links. */
function DescriptionText({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n'), 'text/html')
  const text = (doc.body.textContent ?? '').trim()
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-brand-700 underline" dir="ltr">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-16 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

/** Read-only details of a Google Calendar event. Events are never modified here. */
export function EventDetails({ ev, iso, onClose, onBook }: { ev: CalEvent; iso: string; onClose: () => void; onBook: () => void }) {
  const { settings } = useDb()
  const rule = matchRule(ev.title, settings.highlightRules)
  const when = ev.allDay
    ? ev.startIso === ev.endIso
      ? `${dayLabel(ev.startIso)} · כל היום`
      : `${formatDate(ev.startIso)} – ${formatDate(ev.endIso)} · כל היום`
    : ev.startIso === ev.endIso
      ? `${dayLabel(ev.startIso)} · ${fromMin(ev.startMin)}-${fromMin(ev.endMin)}`
      : `${formatDate(ev.startIso)} ${fromMin(ev.startMin)} – ${formatDate(ev.endIso)} ${fromMin(ev.endMin)}`

  return (
    <Overlay
      open
      title={ev.title}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={onBook}>
          קבע שיעור בזמן הזה
        </Button>
      }
    >
      <div className="rounded-2xl bg-white p-4">
        {rule && (
          <p className="mb-3 inline-block rounded-md px-2 py-1 text-sm font-bold" style={{ background: rule.color, color: textOn(rule.color) }}>
            {rule.label || rule.keyword}
            {rule.important && ' · חשוב'}
          </p>
        )}
        <dl className="-my-2 divide-y divide-gray-100">
          <Row label="מתי">
            <span dir="auto">{when}</span>
          </Row>
          <Row label="יומן">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: ev.color }} />
              {ev.calendarName}
            </span>
          </Row>
          {ev.location && (
            <Row label="מיקום">
              <span className="block break-words">{ev.location}</span>
              <a href={wazeLink(ev.location)} target="_blank" rel="noreferrer" className="text-sm text-brand-700">
                ניווט ב-Waze ↗
              </a>
            </Row>
          )}
          {ev.transparent && <Row label="סטטוס">מסומן "פנוי" — לא נחשב תפוס</Row>}
          {ev.description && (
            <Row label="תיאור">
              <DescriptionText html={ev.description} />
            </Row>
          )}
        </dl>
        {ev.htmlLink && (
          <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="mt-3 block text-sm text-brand-700">
            פתיחה ב-Google Calendar ↗
          </a>
        )}
        {!ev.allDay && iso !== ev.startIso && <p className="mt-2 text-xs text-gray-500">האירוע התחיל ביום קודם.</p>}
      </div>
    </Overlay>
  )
}

const STATUS_LABEL: Record<Lesson['status'], string> = { planned: 'מתוכנן', done: 'התקיים', cancelled: 'בוטל', postponed: 'נדחה' }

/** A lesson from the sheet: details + quick actions (edit, done, paid, cancel). */
export function LessonDetails({ lesson, onClose, onEdit }: { lesson: Lesson; onClose: () => void; onEdit: () => void }) {
  const { db, settings, students, lessonTypes, series } = useDb()
  const type = lessonTypes.find((t) => t.id === lesson.lessonTypeId)
  const sr = lesson.seriesId ? series.find((x) => x.id === lesson.seriesId) : undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const ctx = { db, settings, students, lessonTypes }

  async function run(fn: () => Promise<unknown>, closeAfter = false) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (closeAfter) onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const cancelled = !isLive(lesson)
  return (
    <Overlay
      open
      title={`שיעור – ${lesson.studentName}`}
      onClose={onClose}
      footer={
        !cancelled && (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={onEdit}>
              עריכה
            </Button>
            {confirmCancel ? (
              <Button variant="danger" className="flex-1" disabled={busy} onClick={() => run(() => cancelLesson(ctx, lesson), true)}>
                {busy ? 'מבטל…' : 'כן, לבטל'}
              </Button>
            ) : (
              <Button variant="secondary" className="flex-1 text-red-700" disabled={busy} onClick={() => setConfirmCancel(true)}>
                ביטול שיעור
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-4">
          <dl className="-my-2 divide-y divide-gray-100">
            <Row label="מתי">
              {dayLabel(lesson.date)} · <span dir="ltr">{lesson.start}-{lesson.end}</span>
            </Row>
            <Row label="סוג">
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: EVENT_COLORS[type?.color ?? '']?.hex ?? '#94a3b8' }} />
                {type?.name ?? '—'}
                {lesson.units > 1 && ` ×${lesson.units}`}
              </span>
            </Row>
            <Row label="מחיר">{ils(lesson.price)}</Row>
            <Row label="יומן">{lesson.calendarEventId ? 'מופיע ביומן' : 'בגיליון בלבד'}</Row>
            {sr && <Row label="קבוע">🔁 {seriesLabel(sr)}{sr.active ? '' : ' (הסתיים)'}</Row>}
            {lesson.notes && <Row label="הערות">{lesson.notes}</Row>}
          </dl>
        </div>
        {cancelled ? (
          <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-600">{lesson.status === 'postponed' ? 'השיעור נדחה.' : 'השיעור בוטל.'}</p>
        ) : (
          <CollectPanel lesson={lesson} />
        )}
        {sr?.active && !cancelled && <EndSeriesButton sr={sr} fromIso={lesson.date} onDone={onClose} />}
        {confirmCancel && !cancelled && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            הביטול ישאיר את השיעור בגיליון בסטטוס "בוטל"{lesson.calendarEventId ? ' וימחק את האירוע מהיומן' : ''}.
          </p>
        )}
        {error && <ErrorBox message={error} />}
        <p className="text-center text-xs text-gray-400">{STATUS_LABEL[lesson.status]}</p>
      </div>
    </Overlay>
  )
}
