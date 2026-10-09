import { useState } from 'react'
import { TextInput, Toggle } from '../../components/form'
import { Button, ErrorBox } from '../../components/ui'
import { useDb } from '../../data/db'
import { newId, type HighlightRule } from '../../data/schema'
import { errorText } from '../../lib/api'
import { textOn } from '../calendar/Timeline'
import { Section } from './Section'

const PALETTE = ['#ea580c', '#dc2626', '#db2777', '#9333ea', '#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#475569']

function RuleEditor({ rule, onChange, onRemove }: { rule: HighlightRule; onChange: (r: HighlightRule) => void; onRemove: () => void }) {
  const set = <K extends keyof HighlightRule>(k: K, v: HighlightRule[K]) => onChange({ ...rule, [k]: v })
  return (
    <li className="space-y-3 py-3">
      <div className="flex items-center gap-2">
        <span
          className="truncate rounded-md px-2 py-1 text-xs font-bold"
          style={{ background: rule.color, color: textOn(rule.color) }}
        >
          {rule.label || rule.keyword || 'כלל חדש'}
        </span>
        <button type="button" onClick={onRemove} className="ms-auto text-sm text-red-700">
          הסרה
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">מילת מפתח בכותרת</span>
          <TextInput value={rule.keyword} onChange={(e) => set('keyword', e.target.value)} placeholder="למשל: מוקד" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">תווית</span>
          <TextInput value={rule.label} onChange={(e) => set('label', e.target.value)} placeholder="למשל: משמרת מוקד" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={rule.color === c}
            onClick={() => set('color', c)}
            className={`size-8 rounded-full ring-offset-2 ${rule.color === c ? 'ring-2 ring-gray-800' : ''}`}
            style={{ background: c }}
          />
        ))}
        <input type="color" aria-label="צבע אחר" value={rule.color} onChange={(e) => set('color', e.target.value)} className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
      </div>
      <Toggle
        label="מילה שלמה בלבד"
        hint={'"מוקד" יתאים ל"במוקד" אבל לא ל"מוקדמת"'}
        checked={rule.wholeWord}
        onChange={(v) => set('wholeWord', v)}
      />
      <Toggle
        label="חשוב — אזהרה בקביעת שיעור"
        hint="אזהרה כשהשיעור חופף לאירוע או קרוב אליו"
        checked={rule.important}
        onChange={(v) => set('important', v)}
      />
      {rule.important && (
        <label className="flex items-center gap-2 text-sm">
          <span>אזהרה אם השיעור במרחק פחות מ-</span>
          <TextInput type="number" inputMode="numeric" min={0} step={15} value={rule.windowMin} className="!w-20"
            onChange={(e) => set('windowMin', Math.max(0, Number(e.target.value) || 0))} />
          <span>דק׳</span>
        </label>
      )}
    </li>
  )
}

export function HighlightRulesSection() {
  const { settings, db } = useDb()
  const [rules, setRules] = useState<HighlightRule[]>(settings.highlightRules)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(rules) !== JSON.stringify(settings.highlightRules)
  const valid = rules.every((r) => r.keyword.trim())

  const update = (next: HighlightRule[]) => {
    setSaved(false)
    setRules(next)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const clean = rules.map((r) => ({ ...r, keyword: r.keyword.trim(), label: r.label.trim() }))
      await db.saveSettings({ ...settings, highlightRules: clean })
      setRules(clean)
      setSaved(true)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="הדגשת אירועים">
      <p className="text-xs text-gray-500">אירוע ביומן שהכותרת שלו מכילה את מילת המפתח יוצג בצבע ובתווית של הכלל.</p>
      <ul className="divide-y divide-gray-100">
        {rules.map((r, i) => (
          <RuleEditor
            key={r.id}
            rule={r}
            onChange={(nr) => update(rules.map((x, j) => (j === i ? nr : x)))}
            onRemove={() => update(rules.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => update([...rules, { id: newId('hr'), keyword: '', label: '', color: PALETTE[4], important: false, windowMin: 60, wholeWord: true }])}
      >
        + כלל חדש
      </Button>
      {!valid && <p className="text-sm text-red-700">לכל כלל צריך מילת מפתח.</p>}
      {error && <ErrorBox message={error} />}
      <Button className="mt-2 w-full" disabled={!dirty || !valid || saving} onClick={save}>
        {saving ? 'שומר…' : saved && !dirty ? '✓ נשמר' : 'שמירת כללי הדגשה'}
      </Button>
    </Section>
  )
}
