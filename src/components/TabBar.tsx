import type { Tab } from '../lib/useHashTab'
import { CalendarIcon, ChartIcon, GearIcon, UsersIcon } from './icons'

const items: { id: Tab; label: string; Icon: typeof CalendarIcon }[] = [
  { id: 'calendar', label: 'יומן', Icon: CalendarIcon },
  { id: 'students', label: 'תלמידים', Icon: UsersIcon },
  { id: 'summary', label: 'סיכום חודשי', Icon: ChartIcon },
  { id: 'settings', label: 'הגדרות', Icon: GearIcon },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl">
        {items.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <li key={id} className="flex-1">
              <button
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs ${
                  active ? 'font-semibold text-brand-700' : 'text-gray-500'
                }`}
              >
                <Icon className={active ? 'stroke-[2.2]' : ''} />
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
