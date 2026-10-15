import type { ReactNode } from 'react'
import { Logo } from './logo'

/** Split layout for auth pages: woven brand panel + form. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="weave relative hidden flex-col justify-between overflow-hidden bg-paper-deep p-12 lg:flex">
        <Logo />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-5xl leading-[1.05] tracking-tight">
            Say it once,
            <br />
            <em className="text-thread">on video.</em>
          </p>
          <p className="mt-6 text-lg text-ink-soft">
            Record your screen and camera, share a link the moment you stop. Open source, and yours
            to host.
          </p>
        </div>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-20 h-[26rem] w-[26rem] text-ink/10"
          viewBox="0 0 200 200"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${20 + i * 20} 0v200`} stroke="currentColor" strokeWidth="6" />
          ))}
          <path d="M0 120h200" stroke="var(--color-thread)" strokeWidth="10" opacity="0.7" />
        </svg>
      </section>

      <section className="flex flex-col items-center justify-center px-6 py-16">
        <Logo className="mb-12 lg:hidden" />
        {children}
      </section>
    </main>
  )
}
