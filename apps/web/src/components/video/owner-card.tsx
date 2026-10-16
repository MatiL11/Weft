import type { ReactNode } from 'react'

interface OwnerCardProps {
  id: string
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
}

/** A titled section of the owner's tools. */
export function OwnerCard({ id, title, description, aside, children }: OwnerCardProps) {
  return (
    <section
      aria-labelledby={id}
      className="grid content-start gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id={id} className="font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
