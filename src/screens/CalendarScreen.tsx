import { useEffect, useMemo, useState } from 'react'
import { Button, ErrorBox, Spinner } from '../components/ui'
import { useDb } from '../data/db'
import { busyOf, useEvents, type CalEvent } from '../data/events'
import { freeHoursText, placedLessonsByDay, planDay } from '../data/plan'
import { EVENT_COLORS, isLive, matchRule } from '../data/schema'
import { DAY_SHORT, formatDate } from '../lib/format'
import { toMin } from '../lib/time'
import { addDays, todayIso as getToday, utcToZoned, weekStartOf } from '../lib/tz'
import { BookingForm, type BookingInit } from './booking/BookingForm'
import { EventDetails, LessonDetails } from './calendar/Details'
import { Timeline, type SlotPick, type TimelineDay } from './calendar/Timeline'

const DEFAULT_LEN = 45
const ZOOM_KEY = 'calHourPx' // UI preference only, not personal data
const ZOOM_STEPS = [32, 40, 48, 64, 80, 100, 128, 160]

function useIsWide() {
  const q = '(min-width: 768px)'
  const [wide, setWide] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** Re-render every minute so "now" and today's past slots stay current. */
function useNow() {
  const [now, setNow] = useState(() => utcToZoned(new Date()))
  useEffect(() => {
    const t = setInterval(() => setNow(utcToZoned(new Date())), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function useZoom(): [number, (dir: 1 | -1) => void] {
  const [px, setPx] = useState(() => {
    try {
      const v = Number(localStorage.getItem(ZOOM_KEY))
      return ZOOM_STEPS.includes(v) ? v : 64
    } catch {
      return 64
    }
  })
  const step = (dir: 1 | -1) => {
    const i = Math.max(0, Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(px) + dir))
    setPx(ZOOM_STEPS[i])
    try {
      localStorage.setItem(ZOOM_KEY, String(ZOOM_STEPS[i]))
    } catch {
      /* ignore */
    }
  }
  return [px, step]
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers without async clipboard permission.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

type Open =
  | { kind: 'book'; init: BookingInit; key: number }
  | { kind: 'event'; ev: CalEvent; iso: string }
  | { kind: 'lesson'; id: string }
  | null

let bookingKey = 0
const book = (init: BookingInit): Open => ({ kind: 'book', init, key: ++bookingKey })

export function CalendarScreen() {
  const { settings, lessons, lessonTypes, students } = useDb()
  const wide = useIsWide()
  const now = useNow()
  const today = now.iso
  const [selected, setSelected] = useState(getToday)
  const [len, setLen] = useState(DEFAULT_LEN)
  const [pxPerHour, zoom] = useZoom()
  const [open, setOpen] = useState<Open>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fabOpen, setFabOpen] = useState(false)

  const weekStart = weekStartOf(selected)
  const week = useEvents(weekStart, 7, settings.calendarVisibility, settings.calendarId)
  const next7 = useEvents(today, 7, settings.calendarVisibility, settings.calendarId) // for the WhatsApp text

  const lengths = useMemo(
    () => [...new Set([30, 45, 60, 90, ...lessonTypes.filter((t) => t.active).map((t) => t.durationMin)])].sort((a, b) => a - b),
    [lessonTypes],
  )
  const lessonsByDay = useMemo(() => placedLessonsByDay(lessons, students, lessonTypes), [lessons, students, lessonTypes])
  // Calendar events created for lessons are drawn as the lesson (student name, lesson-type color).
  const lessonEventIds = useMemo(
    () => new Set(lessons.filter((l) => isLive(l) && l.calendarEventId).map((l) => l.calendarEventId)),
    [lessons],
  )

  const days = useMemo((): TimelineDay[] | null => {
    if (!week.data) return null
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(weekStart, i)
      const d = week.data!.days[iso] ?? { allDay: [], timed: [], busy: [] }
      const plan = planDay(iso, settings, d.busy, len, now, lessonsByDay[iso])
      const items: TimelineDay['items'] = d.timed
        .filter((p) => !lessonEventIds.has(p.event.id))
        .map((p) => {
          const rule = matchRule(p.event.title, settings.highlightRules)
          return {
            key: `e${p.event.calendarId}|${p.event.id}|${p.start}`,
            start: p.start,
            end: p.end,
            color: rule?.color ?? p.event.color,
            title: p.event.title,
            sub: p.event.location,
            variant: rule ? ('highlight' as const) : ('event' as const),
            label: rule?.label,
            onTap: () => setOpen({ kind: 'event', ev: p.event, iso }),
          }
        })
      // One block per lesson — a group lesson (rows sharing a groupId) is one block.
      const blocks = new Map<string, typeof lessons>()
      for (const l of lessons) {
        if (l.date !== iso || !isLive(l) || !l.start || !l.end) continue
        const k = l.groupId || l.id
        blocks.set(k, [...(blocks.get(k) ?? []), l])
      }
      for (const [k, rows] of blocks) {
        const l = rows[0]
        const t = lessonTypes.find((x) => x.id === l.lessonTypeId)
        items.push({
          key: `l${k}`,
          start: toMin(l.start),
          end: toMin(l.end),
          color: EVENT_COLORS[t?.color ?? '']?.hex ?? '#64748b',
          title: rows.length > 1 ? `קבוצה – ${rows.map((r) => r.studentName.split(' ')[0]).join(', ')} (${rows.length})` : l.studentName,
          sub: `${t?.name ?? ''}${l.units > 1 ? ` ×${l.units}` : ''}`,
          variant: 'lesson',
          icon: t?.isZoom ? '💻' : '🏠',
          onTap: () => setOpen({ kind: 'lesson', id: l.id }),
        })
      }
      return { iso, plan, allDay: d.allDay, items }
    })
  }, [week.data, weekStart, settings, len, now, lessonsByDay, lessons, lessonTypes, lessonEventIds])

  const shownDays = days ? (wide ? days : days.filter((d) => d.iso === selected)) : null

  // Scroll target: now (if today is shown), else the start of that day's/week's work hours.
  const shownKey = shownDays?.map((d) => d.iso).join() ?? ''
  const scrollTo = useMemo(() => {
    if (!shownDays) return 8 * 60
    if (shownDays.some((d) => d.iso === today)) return Math.max(0, now.min - 60)
    const starts = shownDays.flatMap((d) => d.plan.windows.map((w) => w[0]))
    return starts.length ? Math.min(...starts) : 8 * 60
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])
  const scrollKey = shownKey

  function pickAt(iso: string, start: number | null, adjacent?: SlotPick['adjacent']) {
    setOpen(book({ mode: 'new', iso, start, adjacent }))
  }

  async function copyFree() {
    if (!next7.data) return
    const ok = await copyText(freeHoursText(today, busyOf(next7.data.days), settings, len, lessonsByDay))
    setToast(ok ? 'השעות הפנויות הועתקו — אפשר להדביק בוואטסאפ' : 'ההעתקה נכשלה')
    setTimeout(() => setToast(null), 2500)
  }

  const weekEnd = addDays(weekStart, 6)
  const openLesson = open?.kind === 'lesson' ? lessons.find((l) => l.id === open.id) : undefined

  return (
    <div className="pt-safe mx-auto flex h-full max-w-6xl flex-col px-3 pb-[calc(64px+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-2 py-2">
        <h1 className="text-xl font-bold">יומן</h1>
        <Button variant="secondary" className="min-h-10 px-3 text-sm" disabled={!next7.data} onClick={copyFree}>
          📋 העתק שעות פנויות
        </Button>
      </header>

      {/* week navigation */}
      <div className="flex items-center gap-1">
        <button aria-label="שבוע קודם" onClick={() => setSelected(addDays(selected, -7))} className="flex size-10 items-center justify-center rounded-full text-xl active:bg-gray-200">
          ›
        </button>
        <span className="flex-1 text-center font-medium" dir="ltr">
          {formatDate(weekStart).slice(0, 5)} – {formatDate(weekEnd)}
        </span>
        <button aria-label="שבוע הבא" onClick={() => setSelected(addDays(selected, 7))} className="flex size-10 items-center justify-center rounded-full text-xl active:bg-gray-200">
          ‹
        </button>
        {selected !== today && (
          <button onClick={() => setSelected(today)} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-brand-700 shadow-sm">
            היום
          </button>
        )}
      </div>

      {/* day strip (phone) */}
      {!wide && (
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const iso = addDays(weekStart, i)
            const n = days?.[i].plan.slots.length
            const on = iso === selected
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                aria-pressed={on}
                className={`flex flex-col items-center rounded-xl py-1 ${on ? 'bg-brand-700 text-white' : iso === today ? 'bg-brand-100 text-brand-800' : 'bg-white text-gray-700'}`}
              >
                <span className="text-xs">{DAY_SHORT[i]}</span>
                <span className="text-lg font-semibold leading-tight">{Number(iso.slice(8))}</span>
                <span className={`text-[10px] ${on ? 'text-white/80' : n ? 'text-green-700' : 'text-gray-400'}`}>
                  {n === undefined ? '·' : n ? `${n} פנויות` : '—'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* lesson length + zoom */}
      <div className="my-2 flex items-center gap-2">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-sm text-gray-500">אורך:</span>
          {lengths.map((m) => (
            <button
              key={m}
              onClick={() => setLen(m)}
              aria-pressed={len === m}
              className={`shrink-0 rounded-full px-2.5 py-1 text-sm ${len === m ? 'bg-brand-700 font-semibold text-white' : 'bg-white text-gray-700 shadow-sm'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-full bg-white shadow-sm">
          <button aria-label="הקטנת תצוגה" onClick={() => zoom(-1)} className="flex size-9 items-center justify-center text-lg active:bg-gray-100">
            −
          </button>
          <button aria-label="הגדלת תצוגה" onClick={() => zoom(1)} className="flex size-9 items-center justify-center border-s border-gray-100 text-lg active:bg-gray-100">
            +
          </button>
        </div>
      </div>

      {week.data && week.data.failed.length > 0 && (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          לא ניתן לקרוא אירועים מ: {week.data.failed.join(', ')}
        </p>
      )}

      <div className="min-h-0 flex-1">
        {week.error ? (
          <ErrorBox message={`טעינת היומן נכשלה. ${week.error}`} onRetry={week.refresh} />
        ) : !shownDays ? (
          <Spinner label="טוען אירועים מהיומן…" />
        ) : (
          <Timeline
            days={shownDays}
            pxPerHour={pxPerHour}
            todayIso={today}
            nowMin={now.min}
            showDayHeaders={wide}
            scrollTo={scrollTo}
            scrollKey={scrollKey}
            onPickSlot={(p) => pickAt(p.iso, p.start, p.adjacent)}
            onTapTime={pickAt}
            onTapAllDay={(ev, iso) => setOpen({ kind: 'event', ev, iso })}
            allDayStyle={(ev) => {
              const rule = matchRule(ev.title, settings.highlightRules)
              return rule ? { variant: 'highlight', color: rule.color, label: rule.label } : undefined
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1.5 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded border border-green-400 bg-green-50" /> פנוי</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded border border-dashed border-green-600" /> צמוד (אותה כתובת/זום)</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-brand-100" /> שעות עבודה</span>
        <span>· לחיצה על כל שעה = קביעת שיעור</span>
        <button onClick={week.refresh} className="ms-auto text-brand-700">↻ רענון</button>
      </div>

      {/* floating "+": manual booking / a lesson that already happened */}
      {fabOpen && <div className="fixed inset-0 z-20" onClick={() => setFabOpen(false)} />}
      <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] end-4 z-30 flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <button
              onClick={() => {
                setFabOpen(false)
                pickAt(selected, null)
              }}
              className="rounded-full bg-white px-4 py-2.5 font-medium shadow-lg"
            >
              שיעור חדש (בחירת שעה ידנית)
            </button>
            <button
              onClick={() => {
                setFabOpen(false)
                pickAt(today, null)
              }}
              className="rounded-full bg-white px-4 py-2.5 font-medium shadow-lg"
            >
              + שיעור שהתקיים
            </button>
          </>
        )}
        <button
          aria-label="הוספת שיעור"
          onClick={() => setFabOpen((v) => !v)}
          className={`flex size-14 items-center justify-center rounded-full bg-brand-700 text-3xl text-white shadow-lg transition-transform ${fabOpen ? 'rotate-45' : ''}`}
        >
          +
        </button>
      </div>

      {open?.kind === 'book' && (
        <BookingForm
          key={open.key}
          init={open.init}
          onClose={() => setOpen(null)}
          onChain={(iso, start) => setOpen(book({ mode: 'new', iso, start, chain: true }))}
        />
      )}
      {open?.kind === 'event' && (
        <EventDetails
          ev={open.ev}
          iso={open.iso}
          onClose={() => setOpen(null)}
          onBook={() => {
            const ev = open.ev
            // Timed: the event's start on that day; all-day: that day's work start (or 09:00).
            const start = ev.allDay
              ? (days?.find((d) => d.iso === open.iso)?.plan.windows[0]?.[0] ?? 9 * 60)
              : open.iso === ev.startIso
                ? ev.startMin
                : 0
            pickAt(open.iso, start)
          }}
        />
      )}
      {open?.kind === 'lesson' && openLesson && (
        <LessonDetails lesson={openLesson} onClose={() => setOpen(null)} onEdit={() => setOpen(book({ mode: 'edit', lesson: openLesson }))} />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
