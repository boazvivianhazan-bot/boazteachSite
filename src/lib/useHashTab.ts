import { useEffect, useState } from 'react'

export type Tab = 'calendar' | 'students' | 'summary' | 'settings'
const TABS: Tab[] = ['calendar', 'students', 'summary', 'settings']

function read(): Tab {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0] as Tab
  return TABS.includes(h) ? h : 'calendar'
}

/** Tiny hash router — works on GitHub Pages without a 404 fallback. */
export function useHashTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(read)
  useEffect(() => {
    const on = () => setTab(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [tab, (t) => (location.hash = `/${t}`)]
}
