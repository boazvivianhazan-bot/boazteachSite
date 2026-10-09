import type { ReactNode } from 'react'
import { Card } from '../../components/ui'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-semibold text-gray-500">{title}</h2>
      <Card>{children}</Card>
    </section>
  )
}
