import { useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { Toggle } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { newId, normalizeStudentTypes, type Student } from '../../data/schema'
import { errorText } from '../../lib/api'
import { StudentFields } from './StudentFields'

export const blankStudent = (name = ''): Student => ({
  id: '', name, phone: '', address: '', buildingCode: '', floorApt: '',
  defaultLessonTypeId: '', zoomLink: '', notes: '', active: true, allowedLessonTypeIds: [], parentName: '', parentPhone: '',
})

export function trimStudent(s: Student): Student {
  const out = { ...s }
  for (const k of Object.keys(out) as (keyof Student)[]) {
    if (typeof out[k] === 'string') (out as Record<string, unknown>)[k] = (out[k] as string).trim()
  }
  return out
}

export function StudentForm({
  initial,
  onClose,
  onSaved,
  title,
}: {
  initial: Student | null
  onClose: () => void
  onSaved?: (s: Student) => void | Promise<void>
  title?: string
}) {
  const { db, students } = useDb()
  const [s, setS] = useState<Student>(initial ?? blankStudent())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = s.name.trim()
  const duplicate = name && students.some((o) => o.id !== s.id && o.name.trim() === name)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = normalizeStudentTypes(trimStudent({ ...s, id: s.id || newId('st') }))
      await db.upsert('Students', [saved])
      await onSaved?.(saved)
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay
      open
      title={title ?? (initial ? `עריכה: ${initial.name}` : 'תלמיד חדש')}
      onClose={onClose}
      footer={
        <Button className="w-full" disabled={!name || saving} onClick={save}>
          {saving ? 'שומר…' : 'שמירה'}
        </Button>
      }
    >
      <StudentFields value={s} onChange={setS} />
      {duplicate && <p className="mt-2 text-sm text-amber-700">כבר קיים תלמיד בשם הזה.</p>}
      {initial && (
        <div className="mt-4 rounded-xl bg-white px-3">
          <Toggle label="תלמיד פעיל" checked={s.active} onChange={(v) => setS({ ...s, active: v })} />
        </div>
      )}
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}
    </Overlay>
  )
}
