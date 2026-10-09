import { useState, type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import { LoginScreen } from './components/LoginScreen'
import { ReloginBanner } from './components/ReloginBanner'
import { TabBar } from './components/TabBar'
import { useHashTab, type Tab } from './lib/useHashTab'
import { CalendarScreen } from './screens/CalendarScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StudentsScreen } from './screens/StudentsScreen'
import { DbProvider } from './data/db'
import { ConflictsBanner, SeriesKeeper } from './screens/conflicts/Conflicts'

const screens: Record<Tab, () => ReactNode> = {
  calendar: () => <CalendarScreen />,
  students: () => <StudentsScreen />,
  summary: () => <SummaryScreen />,
  settings: () => <SettingsScreen />,
}

export default function App() {
  const { state } = useAuth()
  const [tab, setTab] = useHashTab()
  // Tabs stay mounted once visited, so switching tabs never loses state.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([tab]))
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab))

  if (state === 'none') return <LoginScreen />

  return (
    <div className="flex h-[100dvh] flex-col">
      <ReloginBanner />
      <DbProvider>
        <SeriesKeeper />
        <ConflictsBanner />
        {/* The screen area scrolls; the conflicts banner (if any) stays above it. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          {[...visited].map((t) => (
            // Only the calendar fills the height exactly; other screens scroll with sticky headers.
            <div key={t} hidden={t !== tab} className={t === 'calendar' ? 'h-full' : undefined}>
              {screens[t]()}
            </div>
          ))}
        </main>
      </DbProvider>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
