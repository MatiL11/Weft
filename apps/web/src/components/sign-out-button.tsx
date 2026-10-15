'use client'

import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-fg"
    >
      Sign out
    </button>
  )
}
