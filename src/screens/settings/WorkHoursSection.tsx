import { useState } from 'react'
import { Field, TextInput, Toggle } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { dayHoursError, type DayHours, type TimeRange } from '../../data/schema'
import { errorText } from '../../lib/api'
import { DAY_NAMES } from '../../lib/format'
import { fromMin, toMin } from '../../lib/time'
import { Section } from './Section'

/** A sensible next range: an hour after the day's last range, three hours long. */
function nextRange(ranges: TimeRange[]): TimeRange {
  if (!ranges.length) return { start: '15:00', end: '22:00' }
  const lastEnd = Math.max(...ranges.map((r) => toMin(r.end)))
  const start = Math.min(lastEnd + 60, 22 * 60)
  return { start: fromMin(start), end: fromMin(Math.min(start + 180, 23 * 60 + 45)) }
}

function DayRow({ day, value, onChange }: { day: number; value: DayHours; onChange: (d: DayHours) => void }) {
  const error = dayHoursError(value)
  const setRange = (i: number, patch: Partial<TimeRange>) =>
    onChange({ ...value, ranges: value.ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  return (
    <li className="py-2">
      <Toggle
        label={`יום ${DAY_NAMES[day]}`}
        checked={value.on}
        onChange={(on) => onChange({ on, ranges: on && !value.ranges.length ? [nextRange([])] : value.ranges })}
      />
      {value.on && (
        <div className="mt-1 space-y-2">
          {value.ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput type="time" step={900} aria-label="משעה" value={r.start}
                onChange={(e) => setRange(i, { start: e.target.value })} />
              <span className="text-gray-400">–</span>
              <TextInput type="time" step={900} aria-label="עד שעה" value={r.end}
                onChange={(e) => setRange(i, { end: e.target.value })} />
              <button
                type="button"
                aria-label="הסרת טווח"
                disabled={value.ranges.length === 1}
                onClick={() => onChange({ ...value, ranges: value.ranges.filter((_, j) => j !== i) })}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-gray-400 active:bg-gray-100 disabled:invisible"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, ranges: [...value.ranges, nextRange(value.ranges)] })}
            className="py-1 text-sm font-medium text-brand-700"
          >
            + הוספת טווח
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </li>
  )
}

const sortRanges = (d: DayHours): DayHours => ({ ...d, ranges: [...d.ranges].sort((a, b) => a.start.localeCompare(b.start)) })

export function WorkHoursSection() {
  const { settings, db } = useDb()
  const [days, setDays] = useState<DayHours[]>(settings.workHours)
  const [bufferMin, setBufferMin] = useState(settings.bufferMin)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(days) !== JSON.stringify(settings.workHours) || bufferMin !== settings.bufferMin
  const valid = days.every((d) => !dayHoursError(d)) && bufferMin >= 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const workHours = days.map(sortRanges)
      await db.saveSettings({ ...settings, workHours, bufferMin })
      setDays(workHours)
      setSaved(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="ימים ושעות עבודה">
      <ul className="-mt-2 divide-y divide-gray-100">
        {days.map((d, i) => (
          <DayRow
            key={i}
            day={i}
            value={d}
            onChange={(next) => {
              setSaved(false)
              setDays(days.map((x, j) => (j === i ? next : x)))
            }}
          />
        ))}
      </ul>
      <div className="mt-4 space-y-4">
        <Field label="הפסקה בין שיעורים (דקות)" hint="זמן מינימלי פנוי לפני ואחרי כל אירוע ביומן.">
          <TextInput type="number" inputMode="numeric" min={0} step={5} value={bufferMin}
            onChange={(e) => {
              setSaved(false)
              setBufferMin(Number(e.target.value))
            }} />
        </Field>
        {error && <ErrorBox message={error} />}
        <Button className="w-full" disabled={!dirty || !valid || saving} onClick={save}>
          {saving ? 'שומר…' : saved && !dirty ? '✓ נשמר' : 'שמירת שעות עבודה'}
        </Button>
      </div>
    </Section>
  )
}
