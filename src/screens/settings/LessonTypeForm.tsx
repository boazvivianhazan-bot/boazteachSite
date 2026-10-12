import { useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { Field, TextInput, Toggle } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { EVENT_COLORS, newId, type LessonType } from '../../data/schema'
import { errorText } from '../../lib/api'

const blank = (): LessonType => ({ id: '', name: '', durationMin: 45, price: 0, isZoom: false, color: '7', active: true, groupPrices: {} })

export function LessonTypeForm({ initial, onClose }: { initial: LessonType | null; onClose: () => void }) {
  const { db } = useDb()
  const [lt, setLt] = useState<LessonType>(initial ?? blank())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof LessonType>(k: K, v: LessonType[K]) => setLt((p) => ({ ...p, [k]: v }))

  const valid = lt.name.trim() && lt.durationMin > 0 && lt.price >= 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await db.upsert('LessonTypes', [{ ...lt, name: lt.name.trim(), id: lt.id || newId('lt') }])
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
      title={initial ? 'עריכת סוג שיעור' : 'סוג שיעור חדש'}
      onClose={onClose}
      footer={
        <Button className="w-full" disabled={!valid || saving} onClick={save}>
          {saving ? 'שומר…' : 'שמירה'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="שם">
          <TextInput value={lt.name} onChange={(e) => set('name', e.target.value)} autoFocus={!initial} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משך (דקות)">
            <TextInput type="number" inputMode="numeric" min={5} step={5} value={lt.durationMin}
              onChange={(e) => set('durationMin', Number(e.target.value))} />
          </Field>
          <Field label="מחיר (₪)">
            <TextInput type="number" inputMode="decimal" min={0} value={lt.price}
              onChange={(e) => set('price', Number(e.target.value))} />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">מחיר לתלמיד בשיעור קבוצתי (₪)</span>
          <div className="grid grid-cols-3 gap-2">
            {(['2', '3', '4'] as const).map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs text-gray-500">{k === '4' ? '4 ומעלה' : `${k} תלמידים`}</span>
                <TextInput
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder={String(lt.price)}
                  value={lt.groupPrices[k] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    const next = { ...lt.groupPrices }
                    if (v === '') delete next[k]
                    else next[k] = Number(v)
                    set('groupPrices', next)
                  }}
                />
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-gray-500">ריק = המחיר הרגיל ({lt.price} ₪) לכל תלמיד.</span>
        </div>
        <Toggle label="שיעור בזום" checked={lt.isZoom} onChange={(v) => set('isZoom', v)} />
        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">צבע ביומן</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(EVENT_COLORS).map(([id, c]) => (
              <button
                key={id}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={lt.color === id}
                onClick={() => set('color', id)}
                className={`size-10 rounded-full ring-offset-2 ${lt.color === id ? 'ring-2 ring-gray-800' : ''}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
        <Toggle label="פעיל (מופיע בטופס קביעת שיעור)" checked={lt.active} onChange={(v) => set('active', v)} />
        <p className="text-xs text-gray-500">שינוי מחיר משפיע רק על שיעורים חדשים — שיעורים קיימים שומרים את המחיר שלהם.</p>
        {error && <ErrorBox message={error} />}
      </div>
    </Overlay>
  )
}
