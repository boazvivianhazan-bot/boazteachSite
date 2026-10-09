import { useEffect, useState } from 'react'
import { Field, Toggle } from '../../components/form'
import { ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { invalidateEvents } from '../../data/events'
import { errorText } from '../../lib/api'
import { calendarName, isCalendarShown, listCalendars, type CalendarListEntry } from '../../lib/calendar'
import { Section } from './Section'

export function CalendarsSection() {
  const { settings, db } = useDb()
  const [cals, setCals] = useState<CalendarListEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setError(null)
    listCalendars().then(setCals, (e) => setError(errorText(e)))
  }, [attempt])

  async function save(patch: Partial<typeof settings>) {
    setSaving(true)
    setError(null)
    try {
      await db.saveSettings({ ...settings, ...patch })
      invalidateEvents()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const writable = cals?.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer') ?? []
  // "primary" is stored by default; show it as the actual primary calendar.
  const current = settings.calendarId === 'primary' ? cals?.find((c) => c.primary)?.id ?? 'primary' : settings.calendarId

  return (
    <Section title="יומני Google">
      {error && (
        <div className="mb-3">
          <ErrorBox message={error} onRetry={cals ? undefined : () => setAttempt((a) => a + 1)} />
        </div>
      )}
      {!cals ? (
        !error && <p className="text-sm text-gray-500">טוען רשימת יומנים…</p>
      ) : (
        <div className="space-y-4">
          <Field label="השיעורים ייכתבו ליומן:">
            <select
              value={current}
              disabled={saving}
              onChange={(e) => save({ calendarId: e.target.value })}
              className="block min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base"
            >
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {calendarName(c)}
                  {c.primary ? ' (ראשי)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="block text-sm font-medium text-gray-700">יומנים מוצגים</span>
            <span className="block text-xs text-gray-500">
              אירועים מכל יומן מוצג נראים ביומן של האפליקציה, ונחשבים תפוסים בהצעת השעות הפנויות (חוץ מאירועים שמסומנים "פנוי").
            </span>
            <ul className="mt-1 divide-y divide-gray-100">
              {cals.map((c) => {
                const isLessons = c.id === current
                return (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="size-3.5 shrink-0 rounded-full" style={{ background: c.backgroundColor ?? '#94a3b8' }} />
                    <div className="min-w-0 flex-1">
                      <Toggle
                        label={calendarName(c)}
                        hint={isLessons ? 'יומן השיעורים – תמיד מוצג' : undefined}
                        disabled={isLessons || saving}
                        checked={isLessons || isCalendarShown(c, settings.calendarVisibility)}
                        onChange={(v) => save({ calendarVisibility: { ...settings.calendarVisibility, [c.id]: v } })}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </Section>
  )
}
