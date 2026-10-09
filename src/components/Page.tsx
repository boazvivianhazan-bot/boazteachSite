import type { ReactNode } from 'react'

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="pt-safe sticky top-0 z-10 bg-[#f5f7f7]/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-xl font-bold">{title}</h1>
          {actions}
        </div>
      </header>
      <div className="px-4 pb-28">{children}</div>
    </div>
  )
}
