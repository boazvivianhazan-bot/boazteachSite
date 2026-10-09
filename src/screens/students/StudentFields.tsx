import { Field, TextArea, TextInput } from '../../components/form'
import { useDb } from '../../data/db'
import { EVENT_COLORS, type Student } from '../../data/schema'
import { ils } from '../../lib/format'

/** Editable student details. Shared by the student form and (later) the booking form. */
export function StudentFields({
  value,
  onChange,
  showName = true,
  showTypes = true,
}: {
  value: Student
  onChange: (s: Student) => void
  showName?: boolean
  showTypes?: boolean
}) {
  const set = <K extends keyof Student>(k: K, v: Student[K]) => onChange({ ...value, [k]: v })

  return (
    <div className="space-y-4">
      {showName && (
        <Field label="שם">
          <TextInput value={value.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </Field>
      )}
      <Field label="טלפון">
        <TextInput type="tel" inputMode="tel" dir="ltr" className="text-end" value={value.phone}
          onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שם הורה">
          <TextInput value={value.parentName} onChange={(e) => set('parentName', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="טלפון הורה" hint="וואטסאפ יישלח להורה">
          <TextInput type="tel" inputMode="tel" dir="ltr" className="text-end" value={value.parentPhone}
            onChange={(e) => set('parentPhone', e.target.value)} autoComplete="off" />
        </Field>
      </div>
      {showTypes && <LessonTypesPicker value={value} onChange={onChange} />}
      <Field label="כתובת">
        <TextInput value={value.address} onChange={(e) => set('address', e.target.value)} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="קוד בניין">
          <TextInput value={value.buildingCode} onChange={(e) => set('buildingCode', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="קומה / דירה">
          <TextInput value={value.floorApt} onChange={(e) => set('floorApt', e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Field label="קישור זום">
        <TextInput type="url" dir="ltr" className="text-end" value={value.zoomLink}
          onChange={(e) => set('zoomLink', e.target.value)} autoComplete="off" />
      </Field>
      <Field label="הערות">
        <TextArea value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

/** Multi-select of the student's lesson types, plus which one is the default. */
function LessonTypesPicker({ value, onChange }: { value: Student; onChange: (s: Student) => void }) {
  const { lessonTypes } = useDb()
  const allowed = value.allowedLessonTypeIds
  // Inactive types stay visible only if the student already has them.
  const shown = lessonTypes.filter((t) => t.active || allowed.includes(t.id))

  function toggle(id: string) {
    if (allowed.includes(id)) {
      const next = allowed.filter((x) => x !== id)
      const def = value.defaultLessonTypeId === id ? next[0] ?? '' : value.defaultLessonTypeId
      onChange({ ...value, allowedLessonTypeIds: next, defaultLessonTypeId: def })
    } else {
      const next = shown.map((t) => t.id).filter((x) => x === id || allowed.includes(x))
      onChange({ ...value, allowedLessonTypeIds: next, defaultLessonTypeId: value.defaultLessonTypeId || id })
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">סוגי שיעור לתלמיד</span>
        <div className="grid grid-cols-2 gap-2">
          {shown.map((t) => {
            const on = allowed.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(t.id)}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start text-sm ${
                  on ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : 'border-gray-300 bg-white'
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs text-white ${
                    on ? 'border-brand-600 bg-brand-600' : 'border-gray-300'
                  }`}
                >
                  {on && '✓'}
                </span>
                <span className="size-3 shrink-0 rounded-full" style={{ background: EVENT_COLORS[t.color]?.hex }} />
                <span className="flex-1">{t.name}</span>
              </button>
            )
          })}
        </div>
      </div>
      {allowed.length > 1 && (
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">ברירת מחדל בקביעת שיעור</span>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {allowed.map((id) => {
              const t = lessonTypes.find((x) => x.id === id)
              if (!t) return null
              const on = value.defaultLessonTypeId === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...value, defaultLessonTypeId: id })}
                  className={`min-h-10 rounded-full px-4 text-sm ${on ? 'bg-brand-700 font-semibold text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {t.name} · {ils(t.price)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
