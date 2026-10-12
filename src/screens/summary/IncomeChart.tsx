import { useState } from 'react'
import { ils } from '../../lib/format'
import { monthLabel, monthShort } from '../../data/summary'

// Validated pair (dataviz palette check: lightness, chroma, colour-blind separation, contrast).
const EARNED = '#0d9488' // teal-600 — income from lessons that happened
const RECEIVED = '#d97706' // amber-600 — money received
const H = 120 // plot height (px)

/**
 * Per month, two bars side by side on one ₪ axis: earned (lessons done) and
 * received (payments). Months run right-to-left (RTL). Tap a month to open it.
 */
export function IncomeChart({
  data,
  selected,
  onSelect,
}: {
  data: { ym: string; earned: number; received: number }[]
  selected: string
  onSelect: (ym: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...data.flatMap((d) => [d.earned, d.received]))
  const focus = data.find((d) => d.ym === (hover ?? selected))
  const bar = (v: number, color: string) => (
    <span className="block w-1/2 max-w-5 rounded-t" style={{ height: v > 0 ? Math.max((v / max) * H, 2) : 0, background: color }} />
  )

  return (
    <figure aria-label="הכנסה ותשלומים לפי חודש">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: EARNED }} /> הכנסה מהשיעורים</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: RECEIVED }} /> התקבל</span>
        {focus && (
          <span className="ms-auto text-gray-800" aria-live="polite">
            <b>{monthLabel(focus.ym)}</b>: {ils(focus.earned)} · התקבל {ils(focus.received)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 border-b border-gray-300" style={{ height: H + 4 }}>
        {data.map((d) => {
          const on = d.ym === selected
          return (
            <button
              key={d.ym}
              type="button"
              onClick={() => onSelect(d.ym)}
              onMouseEnter={() => setHover(d.ym)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${monthLabel(d.ym)}: הכנסה ${ils(d.earned)}, התקבל ${ils(d.received)}`}
              aria-pressed={on}
              className={`flex h-full flex-1 items-end justify-center gap-[2px] rounded-t ${on ? 'bg-gray-100' : ''}`}
            >
              {bar(d.earned, EARNED)}
              {bar(d.received, RECEIVED)}
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex gap-2">
        {data.map((d) => (
          <span key={d.ym} className={`flex-1 text-center text-[11px] ${d.ym === selected ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
            {monthShort(d.ym)}
          </span>
        ))}
      </div>
    </figure>
  )
}
