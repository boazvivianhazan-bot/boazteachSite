import { useMemo, useState } from 'react'
import { Page } from '../components/Page'
import { TextInput } from '../components/form'
import { Button, Card } from '../components/ui'
import { useDb } from '../data/db'
import { EVENT_COLORS, detailsMissing, type Student } from '../data/schema'
import { ils } from '../lib/format'
import { MissingTag, StudentCard } from './students/StudentCard'
import { useBilling } from '../data/payments'
import { StudentForm } from './students/StudentForm'

export function StudentsScreen() {
  const { students, lessonTypes } = useDb()
  const { ownBalanceOf } = useBilling()
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    return students
      .filter((s) => showInactive || s.active)
      .filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          s.address.toLowerCase().includes(needle) ||
          (digits.length >= 3 && s.phone.replace(/\D/g, '').includes(digits)),
      )
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'he'))
  }, [students, q, showInactive])

  const typesLabel = (s: Student) =>
    [s.defaultLessonTypeId, ...s.allowedLessonTypeIds.filter((id) => id !== s.defaultLessonTypeId)]
      .map((id) => lessonTypes.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(' + ')
  const open = students.find((s) => s.id === openId)
  const inactiveCount = students.filter((s) => !s.active).length

  return (
    <Page
      title="תלמידים"
      actions={
        <Button className="min-h-10 px-3 text-sm" onClick={() => setCreating(true)}>
          + תלמיד חדש
        </Button>
      }
    >
      <TextInput type="search" placeholder="חיפוש לפי שם, טלפון או כתובת" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />

      {list.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500">{students.length ? 'לא נמצאו תלמידים.' : 'עדיין אין תלמידים. הוסף את הראשון!'}</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-gray-100">
            {list.map((s) => {
              // Her OWN amount (in a family: her lessons minus her share of the family payments).
              const bal = ownBalanceOf(s.id)
              const lt = lessonTypes.find((t) => t.id === s.defaultLessonTypeId)
              return (
                <li key={s.id}>
                  <button onClick={() => setOpenId(s.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-start active:bg-gray-50 ${s.active ? '' : 'opacity-50'}`}>
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-white"
                      style={{ background: EVENT_COLORS[lt?.color ?? '']?.hex ?? '#94a3b8' }}
                    >
                      {s.name.trim().charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{s.name}</span>
                        {detailsMissing(s) && <MissingTag />}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{[typesLabel(s), s.address].filter(Boolean).join(' · ')}</span>
                    </span>
                    {bal !== 0 && (
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-semibold ${bal < 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {bal < 0 ? `חוב ${ils(-bal)}` : `זכות ${ils(bal)}`}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {inactiveCount > 0 && (
        <button onClick={() => setShowInactive((v) => !v)} className="mt-3 w-full py-2 text-sm text-brand-700">
          {showInactive ? 'הסתר תלמידים לא פעילים' : `הצג גם תלמידים לא פעילים (${inactiveCount})`}
        </button>
      )}

      {open && <StudentCard student={open} onClose={() => setOpenId(null)} />}
      {creating && <StudentForm initial={null} onClose={() => setCreating(false)} onSaved={(s) => setOpenId(s.id)} />}
    </Page>
  )
}
