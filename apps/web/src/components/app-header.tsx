import Link from 'next/link'
import type { ReactNode } from 'react'
import { LocaleSwitcher } from './locale-switcher'
import { Logo } from './logo'
import { SignOutButton } from './sign-out-button'

interface AppHeaderProps {
  /** Extra actions shown before the language switcher. */
  actions?: ReactNode
}

/** Top bar for signed-in pages. */
export function AppHeader({ actions }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
        <Link href="/" className="rounded-lg">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {actions}
          <LocaleSwitcher />
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
