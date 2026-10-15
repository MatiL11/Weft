import type { ReactNode } from 'react'
import { Logo } from './logo'
import { RecordingStage } from './recording-stage'

interface AuthShellProps {
  children: ReactNode
  headline: string
  tagline: string
  toolbar?: ReactNode
}

/** Split layout for auth pages: product illustration on the left, form on the right. */
export function AuthShell({ children, headline, tagline, toolbar }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden flex-col justify-between gap-16 overflow-hidden border-r border-line bg-surface-sunken p-12 lg:flex">
        <Logo />
        <div className="grid justify-items-start gap-16 pl-6">
          <RecordingStage elapsedLabel="00:42" />
          <div className="max-w-md space-y-3">
            <p className="text-4xl leading-[1.1] font-semibold tracking-tight">{headline}</p>
            <p className="max-w-[44ch] text-muted">{tagline}</p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          {toolbar}
        </div>
        <div className="flex flex-1 items-center justify-center py-12">{children}</div>
      </main>
    </div>
  )
}
