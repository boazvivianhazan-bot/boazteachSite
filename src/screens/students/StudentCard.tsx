import { useMemo, useState, type ReactNode } from 'react'
import { Overlay } from '../../components/Overlay'
import { Button, Card } from '../../components/ui'
import { useDb } from '../../data/db'
import { EVENT_COLORS, detailsMissing, isLive, type Lesson, type Student } from '../../data/schema'
import { telLink, wazeLink, whatsappLink, whatsappPhone } from '../../lib/contact'
import { formatDate, ils } from '../../lib/format'
import { useBilling } from '../../data/payments'
import { BalanceBox } from '../payments/BalanceBox'
import { FamilySection } from '../payments/FamilySection'
import { SeriesList } from './SeriesList'
import { StudentForm } from './StudentForm'

const STATUS: Record<Lesson['status'], { label: string; cls: string }> = {
  planned: { label: 'מתוכנן', cls: 'bg-blue-50 text-blue-700' },
  done: { label: 'התקיים', cls: 'bg-green-50 text-green-700' },
  cancelled: { label: 'בוטל', cls: 'bg-gray-100 text-gray-500 line-through' },
  postponed: { label: 'נדחה', cls: 'bg-gray-100 text-gray-500' },
}

export function MissingTag() {
  return <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">פרטים חסרים</span>
}

function ActionLink({ href, label, icon, disabled }: { href: string; label: string; icon: ReactNode; disabled?: boolean }) {
  if (disabled)
    return (
      <span className="flex flex-col items-center gap-1 rounded-xl bg-gray-100 py-3 text-xs text-gray-400">
        {icon}
        {label}
      </span>
    )
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl bg-brand-50 py-3 text-xs font-medium text-brand-800 active:bg-brand-100">
      {icon}
      {label}
    </a>
  )
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-24 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>
        {value}
      </dd>
    </div>
  )
}

export function StudentCard({ student, onClose }: { student: Student; onClose: () => void }) {
  const { lessons, lessonTypes } = useDb()
  const [editing, setEditing] = useState(false)

  const history = useMemo(
    () =>
      lessons
        .filter((l) => l.studentId === student.id)
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)),
    [lessons, student.id],
  )
  const done = history.filter((l) => l.status === 'done').reduce((n, l) => n + l.units, 0)
  const { payerOfStudent } = useBilling()
  const payer = payerOfStudent(student)
  // Default first, then the rest in the order they appear in Settings.
  const types = lessonTypes
    .filter((t) => student.allowedLessonTypeIds.includes(t.id))
    .sort((a, b) => Number(b.id === student.defaultLessonTypeId) - Number(a.id === student.defaultLessonTypeId))

  return (
    <Overlay open title={student.name} onClose={onClose}>
      <div className="space-y-4">
        {detailsMissing(student) && (
          <button onClick={() => setEditing(true)} className="w-full rounded-xl bg-amber-50 p-3 text-start text-sm text-amber-900">
            <MissingTag /> אין עדיין טלפון או כתובת — לחץ להשלמת הפרטים
          </button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <ActionLink href={telLink(student.phone)} label="התקשרות" icon={<span className="text-xl">📞</span>} disabled={!student.phone} />
          <ActionLink
            href={whatsappLink(whatsappPhone(student))}
            label={student.parentPhone ? 'וואטסאפ להורה' : 'וואטסאפ'}
            icon={<span className="text-xl">💬</span>}
            disabled={!whatsappPhone(student)}
          />
          <ActionLink href={wazeLink(student.address)} label="ניווט Waze" icon={<span className="text-xl">🚗</span>} disabled={!student.address} />
        </div>

        {payer && <BalanceBox payer={payer} student={student} />}
        <FamilySection student={student} />

        <Card>
          <dl className="-my-2 divide-y divide-gray-100">
            <Row label="טלפון" value={student.phone} ltr />
            <Row label="הורה" value={[student.parentName, student.parentPhone].filter(Boolean).join(' · ')} />
            {types.length > 0 && (
              <div className="flex gap-3 py-2">
                <dt className="w-24 shrink-0 text-sm text-gray-500">סוגי שיעור</dt>
                <dd className="flex flex-1 flex-wrap gap-1.5">
                  {types.map((t) => (
                    <span key={t.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm ${t.id === student.defaultLessonTypeId ? 'bg-brand-50 font-semibold text-brand-800' : 'bg-gray-100'}`}>
                      <span className="size-2.5 rounded-full" style={{ background: EVENT_COLORS[t.color]?.hex }} />
                      {t.name} · {ils(t.price)}
                      {t.id === student.defaultLessonTypeId && types.length > 1 && <span className="text-xs font-normal">(ברירת מחדל)</span>}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <Row label="כתובת" value={student.address} />
            <Row label="קוד בניין" value={student.buildingCode} />
            <Row label="קומה / דירה" value={student.floorApt} />
            <Row label="זום" value={student.zoomLink} ltr />
            <Row label="הערות" value={student.notes} />
            {!student.active && <Row label="סטטוס" value="לא פעיל" />}
          </dl>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setEditing(true)}>
            עריכת פרטים
          </Button>
        </Card>

        <SeriesList studentId={student.id} />

        <section>
          <h3 className="mb-2 px-1 text-sm font-semibold text-gray-500">
            היסטוריית שיעורים ({history.length}) · התקיימו {done}
          </h3>
          {history.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500">אין עדיין שיעורים.</p>
            </Card>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-gray-100">
                {history.map((l) => {
                  const lt = lessonTypes.find((t) => t.id === l.lessonTypeId)
                  return (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: EVENT_COLORS[lt?.color ?? '']?.hex ?? '#ccc' }} />
                      <span className="flex-1 text-sm">
                        <span className="font-medium">{formatDate(l.date)}</span> · {l.start}
                        <span className="block text-xs text-gray-500">{lt?.name ?? ''}{l.units > 1 ? ` ×${l.units}` : ''}</span>
                      </span>
                      <span className="text-end text-sm">
                        <span className={!isLive(l) ? 'text-gray-400 line-through' : 'font-medium'}>{ils(l.price)}</span>
                        <span className="mt-0.5 flex justify-end gap-1">
                          <span className={`rounded-md px-1.5 text-xs ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </section>
      </div>
      {editing && <StudentForm initial={student} onClose={() => setEditing(false)} />}
    </Overlay>
  )
}
