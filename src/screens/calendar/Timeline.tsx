import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { CalEvent } from '../../data/events'
import type { DayPlan } from '../../data/plan'
import { DAY_SHORT } from '../../lib/format'
import { layoutColumns } from '../../lib/layout'
import { fromMin } from '../../lib/time'
import { weekdayOf } from '../../lib/tz'

const MIN_ITEM_PX = 22
const DAY = 24 * 60

export interface SlotPick {
  iso: string
  start: number
  end: number
  /** Set for a back-to-back slot: only valid for this place (address / Zoom). */
  adjacent?: { place: string; nextTo: string }
}

/** Something drawn on the timeline: a calendar event piece or a lesson from the sheet. */
export interface TimelineItem {
  key: string
  start: number
  end: number
  color: string
  title: string
  sub?: string
  /** lesson = solid + 💻/🏠 icon (stands out); highlight = matched a keyword rule; event = light. */
  variant: 'lesson' | 'highlight' | 'event'
  label?: string // highlight rule label, e.g. "משמרת מוקד"
  icon?: string // lessons: 💻 Zoom / 🏠 frontal
  onTap: () => void
}

/** Inline style per variant: lessons pop, ordinary events stay light. */
export function itemStyle(variant: TimelineItem['variant'], color: string): CSSProperties {
  if (variant === 'lesson')
    return { background: color, color: textOn(color), border: '2px solid rgba(0,0,0,0.35)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }
  if (variant === 'highlight') return { background: color, color: textOn(color), border: '1px solid rgba(0,0,0,0.2)' }
  return { background: `${color}26`, color: '#1f2937', border: `1px solid ${color}66`, borderInlineStartWidth: 3, borderInlineStartColor: color }
}

export interface TimelineDay {
  iso: string
  plan: DayPlan
  allDay: CalEvent[]
  items: TimelineItem[]
}

interface Props {
  days: TimelineDay[]
  pxPerHour: number
  todayIso: string
  nowMin: number
  showDayHeaders: boolean
  /** Minute to scroll to when scrollKey changes. */
  scrollTo: number
  scrollKey: string
  onPickSlot: (p: SlotPick) => void
  onTapTime: (iso: string, min: number) => void
  onTapAllDay: (ev: CalEvent, iso: string) => void
  /** Optional highlight-rule styling for all-day events. */
  allDayStyle?: (ev: CalEvent) => { variant: TimelineItem['variant']; color: string; label?: string } | undefined
}

/** Readable text color on a calendar color. */
export function textOn(hex: string) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return '#fff'
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#1f2937' : '#fff'
}

function Positioned({ top, height, style, className, onTap, label, children }: {
  top: number; height: number; style: CSSProperties; className: string
  onTap: () => void; label?: string; children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onTap()
      }}
      className={`absolute overflow-hidden rounded-md text-start text-xs leading-tight ${className}`}
      style={{ top, height, ...style }}
    >
      {children}
    </button>
  )
}

export function Timeline({
  days, pxPerHour, todayIso, nowMin, showDayHeaders, scrollTo, scrollKey, onPickSlot, onTapTime, onTapAllDay, allDayStyle,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const pxPerMin = pxPerHour / 60
  const y = (min: number) => min * pxPerMin
  const hours = Array.from({ length: 25 }, (_, i) => i * 60)
  const hasAllDay = days.some((d) => d.allDay.length)

  // Jump to the requested time when the day/week (scrollKey) changes.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, y(scrollTo) - 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey])

  // Keep the same time centered when zooming.
  const prevPx = useRef(pxPerHour)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && prevPx.current !== pxPerHour) {
      const center = el.scrollTop + el.clientHeight / 2
      el.scrollTop = (center * pxPerHour) / prevPx.current - el.clientHeight / 2
    }
    prevPx.current = pxPerHour
  }, [pxPerHour])

  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-sm">
      {(showDayHeaders || hasAllDay) && (
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
          {showDayHeaders && (
            <div className="flex ps-12">
              {days.map((d) => (
                <div key={d.iso} className={`flex-1 py-1.5 text-center text-sm ${d.iso === todayIso ? 'font-bold text-brand-700' : 'text-gray-600'}`}>
                  {DAY_SHORT[weekdayOf(d.iso)]} {Number(d.iso.slice(8))}/{Number(d.iso.slice(5, 7))}
                </div>
              ))}
            </div>
          )}
          {hasAllDay && (
            <div className="flex ps-12">
              {days.map((d) => (
                <div key={d.iso} className="min-w-0 flex-1 space-y-0.5 border-s border-gray-100 p-0.5">
                  {d.allDay.map((ev) => (
                    <button
                      key={ev.id + ev.calendarId}
                      onClick={() => onTapAllDay(ev, d.iso)}
                      className="block w-full truncate rounded px-1.5 py-0.5 text-start text-[11px] font-medium"
                      style={itemStyle(allDayStyle?.(ev)?.variant ?? 'event', allDayStyle?.(ev)?.color ?? ev.color)}
                    >
                      {allDayStyle?.(ev)?.label && <span className="font-bold">{allDayStyle(ev)!.label}: </span>}
                      {ev.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="relative flex" style={{ height: y(DAY) + 12 }}>
        {/* hour labels */}
        <div className="relative w-12 shrink-0">
          {hours.slice(1, -1).map((m) => (
            <span key={m} className="absolute end-1.5 -translate-y-1/2 text-[11px] text-gray-400" style={{ top: y(m) + 6 }}>
              {fromMin(m)}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const layout = layoutColumns(d.items, MIN_ITEM_PX / pxPerMin)
          return (
            <div
              key={d.iso}
              className="relative flex-1 cursor-pointer border-s border-gray-100"
              style={{ marginTop: 6, height: y(DAY) }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const min = Math.floor((e.clientY - rect.top) / pxPerMin / 15) * 15
                onTapTime(d.iso, Math.max(0, Math.min(DAY - 15, min)))
              }}
            >
              {/* work hours shade */}
              {d.plan.windows.map(([s, e], i) => (
                <div key={`w${i}`} className="pointer-events-none absolute inset-x-0 bg-brand-50" style={{ top: y(s), height: y(e) - y(s) }} />
              ))}
              {hours.map((m) => (
                <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-gray-100" style={{ top: y(m) }} />
              ))}

              {/* green suggestions (under events) */}
              {d.plan.slots.map(([s, e]) => (
                <Positioned
                  key={`s${s}`}
                  top={y(s)}
                  height={y(e) - y(s)}
                  style={{ insetInline: 2 }}
                  className="border border-green-400 bg-green-50/90 px-1.5 py-0.5 font-medium text-green-800 active:bg-green-100"
                  label={`שעה פנויה ${fromMin(s)}-${fromMin(e)}`}
                  onTap={() => onPickSlot({ iso: d.iso, start: s, end: e })}
                >
                  {fromMin(s)}
                  {!showDayHeaders && `-${fromMin(e)}`}
                </Positioned>
              ))}
              {d.plan.adjacent.map((a) => (
                <Positioned
                  key={`a${a.start}`}
                  top={y(a.start)}
                  height={y(a.end) - y(a.start)}
                  style={{ insetInlineEnd: 2, width: '48%', zIndex: 1 }}
                  className="border border-dashed border-green-600 bg-white px-1 py-0.5 font-medium text-green-800 active:bg-green-50"
                  label={`שעה צמודה ${fromMin(a.start)}-${fromMin(a.end)}, ללא הפסקה, ${a.place === 'zoom' ? 'זום' : 'באותה כתובת'} כמו ${a.nextTo}`}
                  onTap={() => onPickSlot({ iso: d.iso, start: a.start, end: a.end, adjacent: { place: a.place, nextTo: a.nextTo } })}
                >
                  <span className="block">{fromMin(a.start)}</span>
                  {y(a.end) - y(a.start) > 30 && <span className="block truncate text-[10px] font-normal">צמוד {a.place === 'zoom' ? '(זום)' : ''}</span>}
                </Positioned>
              ))}

              {/* events and lessons, side by side when they overlap */}
              {d.items.map((it) => {
                const p = layout.get(it.key) ?? { col: 0, cols: 1 }
                const h = Math.max(y(it.end) - y(it.start), MIN_ITEM_PX)
                const oneLine = h < 40
                return (
                  <Positioned
                    key={it.key}
                    top={y(it.start)}
                    height={h - 1}
                    onTap={it.onTap}
                    style={{
                      insetInlineStart: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                      width: `calc(${100 / p.cols}% - 2px)`,
                      zIndex: it.variant === 'lesson' ? 4 : it.variant === 'highlight' ? 3 : 2,
                      ...itemStyle(it.variant, it.color),
                    }}
                    className="px-1.5 py-0.5"
                  >
                    {oneLine ? (
                      <span className="block truncate">
                        {it.icon && `${it.icon} `}
                        <span className="opacity-90">{fromMin(it.start)}</span>{' '}
                        <span className={it.variant === 'event' ? 'font-medium' : 'font-bold'}>{it.label ? `${it.label}: ` : ''}{it.title}</span>
                      </span>
                    ) : (
                      <>
                        {it.label && <span className="block truncate text-[10px] font-bold tracking-wide">{it.label}</span>}
                        <span className={`block truncate ${it.variant === 'event' ? 'font-medium' : 'font-bold'}`}>
                          {it.icon && `${it.icon} `}
                          {it.title}
                        </span>
                        <span className="block truncate opacity-90">
                          {fromMin(it.start)}-{fromMin(Math.min(it.end, DAY - 1))}
                        </span>
                        {it.sub && h > 56 && <span className="block truncate opacity-90">{it.sub}</span>}
                      </>
                    )}
                  </Positioned>
                )
              })}

              {d.iso === todayIso && (
                <div className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-red-500" style={{ top: y(nowMin) }}>
                  <span className="absolute -top-[5px] -start-[5px] size-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
