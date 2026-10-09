import { useState } from 'react'
import { ils } from '../../lib/format'
import { monthLabel, monthShort } from '../../data/summary'

const PAID = '#0f766e' // brand-700
const UNPAID = '#99f6e4' // teal-200 — same hue, lighter step
const H = 120 // plot height (px)

/**
 * Income per month as stacked bars: paid (dark) at the base, unpaid (light) on
 * top. One ₪ axis. Months run right-to-left (RTL). Tap a bar to open that month.
 */
export function IncomeChart({
  data,
  selected,
  onSelect,
}: {
  data: { ym: string; paid: number; unpaid: number }[]
  selected: string
  onSelect: (ym: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...data.map((d) => d.paid + d.unpaid))
  const focus = data.find((d) => d.ym === (hover ?? selected))

  return (
    <figure aria-label="הכנסה לפי חודש">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: PAID }} /> שולם</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: UNPAID }} /> לא שולם</span>
        {focus && (
          <span className="ms-auto text-gray-800" aria-live="polite">
            <b>{monthLabel(focus.ym)}</b>: {ils(focus.paid + focus.unpaid)} · שולם {ils(focus.paid)}
          </span>
        )}
      </div>

      {/* bars */}
      <div className="flex items-end gap-2 border-b border-gray-300" style={{ height: H + 16 }}>
        {data.map((d) => {
          const total = d.paid + d.unpaid
          const on = d.ym === selected
          return (
            <button
              key={d.ym}
              type="button"
              onClick={() => onSelect(d.ym)}
              onMouseEnter={() => setHover(d.ym)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${monthLabel(d.ym)}: ${ils(total)}, מתוכם ${ils(d.paid)} שולם`}
              aria-pressed={on}
              className="flex h-full flex-1 flex-col items-center justify-end"
            >
              {on && total > 0 && <span className="mb-0.5 text-[10px] font-semibold text-gray-800">{ils(total)}</span>}
              <span className={`flex w-full max-w-10 flex-col justify-end gap-[2px] rounded-t ${on ? 'outline-2 outline-offset-2 outline-gray-800' : ''}`}>
                {d.unpaid > 0 && <span className="block w-full rounded-t" style={{ height: Math.max((d.unpaid / max) * H, 2), background: UNPAID }} />}
                {d.paid > 0 && (
                  <span className={`block w-full ${d.unpaid > 0 ? '' : 'rounded-t'}`} style={{ height: Math.max((d.paid / max) * H, 2), background: PAID }} />
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* month labels */}
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
