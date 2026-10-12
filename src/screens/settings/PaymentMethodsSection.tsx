import { useState } from 'react'
import { TextInput } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { errorText } from '../../lib/api'
import { Section } from './Section'

/** Editable list of payment methods (מזומן / ביט / פייבוקס / העברה …). */
export function PaymentMethodsSection() {
  const { settings, db } = useDb()
  const [list, setList] = useState(settings.paymentMethods)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(list) !== JSON.stringify(settings.paymentMethods)

  const update = (next: string[]) => {
    setSaved(false)
    setList(next)
  }
  function add() {
    const v = draft.trim()
    if (v && !list.includes(v)) update([...list, v])
    setDraft('')
  }
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await db.saveSettings({ ...settings, paymentMethods: list })
      setSaved(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="אמצעי תשלום">
      <p className="mb-2 text-xs text-gray-500">הראשון ברשימה נבחר כברירת מחדל בגבייה מהירה.</p>
      <ul className="mb-3 flex flex-wrap gap-2">
        {list.map((m, i) => (
          <li key={m} className="flex items-center gap-1 rounded-full bg-gray-100 ps-3 text-sm">
            {m}
            {i > 0 && (
              <button aria-label={`להעביר את ${m} להתחלה`} onClick={() => update([m, ...list.filter((x) => x !== m)])} className="px-1 text-gray-500">
                ⇧
              </button>
            )}
            <button aria-label={`הסרת ${m}`} onClick={() => update(list.filter((x) => x !== m))} className="px-2 text-gray-500">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <TextInput value={draft} placeholder="אמצעי חדש" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="secondary" className="shrink-0" disabled={!draft.trim()} onClick={add}>
          הוספה
        </Button>
      </div>
      {error && <ErrorBox message={error} />}
      <Button className="mt-3 w-full" disabled={!dirty || saving || !list.length} onClick={save}>
        {saving ? 'שומר…' : saved && !dirty ? '✓ נשמר' : 'שמירת אמצעי תשלום'}
      </Button>
    </Section>
  )
}
