import { useEffect, useRef, type ReactNode } from 'react'

// While any overlay is open there is exactly one extra history entry, so the
// phone's back button closes the top overlay instead of leaving the app.
// History is synced after the current render settles, so an overlay closing
// while another opens (or StrictMode's mount/unmount/mount) causes no churn.
const stack: { close: () => void }[] = []
let hasEntry = false
let ignorePops = 0
let syncQueued = false

function syncHistory() {
  if (syncQueued) return
  syncQueued = true
  setTimeout(() => {
    syncQueued = false
    if (stack.length > 0 && !hasEntry) {
      history.pushState({ overlay: true }, '')
      hasEntry = true
    } else if (stack.length === 0 && hasEntry) {
      hasEntry = false
      ignorePops++
      history.back()
    }
  })
}

window.addEventListener('popstate', () => {
  if (ignorePops > 0) {
    ignorePops--
    return
  }
  if (!hasEntry) return
  hasEntry = false
  stack.pop()?.close()
  syncHistory() // re-arm if overlays remain open underneath
})

export function useBackClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return
    const entry = { close: () => ref.current() }
    stack.push(entry)
    syncHistory()
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      syncHistory()
    }
  }, [open])
}

/** Full-screen panel on phones, centered card on wider screens. */
export function Overlay({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useBackClose(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-black/30 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="pt-safe flex h-full w-full flex-col bg-[#f5f7f7] sm:h-auto sm:max-h-full sm:max-w-lg sm:rounded-2xl sm:shadow-xl"
      >
        <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-2 py-2 sm:rounded-t-2xl">
          <button onClick={onClose} aria-label="סגירה" className="flex size-11 items-center justify-center rounded-full text-2xl text-gray-500 active:bg-gray-100">
            ×
          </button>
          <h2 className="flex-1 truncate text-lg font-semibold">{title}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="pb-safe border-t border-gray-200 bg-white p-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}
