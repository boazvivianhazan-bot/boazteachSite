import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Page } from '../components/Page'
import { Button } from '../components/ui'
import { useDb } from '../data/db'
import { EVENT_COLORS, type LessonType } from '../data/schema'
import { ils } from '../lib/format'
import { LessonTypeForm } from './settings/LessonTypeForm'
import { Section } from './settings/Section'
import { WorkHoursSection } from './settings/WorkHoursSection'
import { CalendarsSection } from './settings/CalendarsSection'
import { HighlightRulesSection } from './settings/HighlightRulesSection'
import { DeleteTestDataSection } from './settings/DeleteTestDataSection'

function LessonTypesSection() {
  const { lessonTypes } = useDb()
  const [editing, setEditing] = useState<LessonType | 'new' | null>(null)
  const sorted = [...lessonTypes].sort((a, b) => Number(b.active) - Number(a.active))
  return (
    <Section title="סוגי שיעורים ומחירים">
      <ul className="-my-2 divide-y divide-gray-100">
        {sorted.map((lt) => (
          <li key={lt.id}>
            <button onClick={() => setEditing(lt)} className={`flex w-full items-center gap-3 py-3 text-start ${lt.active ? '' : 'opacity-50'}`}>
              <span className="size-4 shrink-0 rounded-full" style={{ background: EVENT_COLORS[lt.color]?.hex }} />
              <span className="flex-1">
                <span className="font-medium">{lt.name}</span>
                <span className="block text-xs text-gray-500">
                  {lt.durationMin} דק׳ · {lt.isZoom ? 'זום' : 'פרונטלי'}
                  {!lt.active && ' · לא פעיל'}
                </span>
              </span>
              <span className="font-semibold">{ils(lt.price)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing('new')}>
        + סוג שיעור חדש
      </Button>
      {editing && <LessonTypeForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  )
}

export function SettingsScreen() {
  const { signOut } = useAuth()
  const { spreadsheetId, reload } = useDb()
  return (
    <Page title="הגדרות">
      <LessonTypesSection />
      <WorkHoursSection />
      <CalendarsSection />
      <HighlightRulesSection />
      <Section title="מסד נתונים">
        <div className="space-y-2">
          <a
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center rounded-xl border border-gray-300 font-medium text-brand-700"
          >
            פתיחת הגיליון Lessons DB ↗
          </a>
          <Button variant="secondary" className="w-full" onClick={reload}>
            טעינה מחדש מהגיליון
          </Button>
        </div>
      </Section>
      <DeleteTestDataSection />
      <Button variant="secondary" className="w-full text-red-700" onClick={signOut}>
        התנתקות
      </Button>
    </Page>
  )
}
