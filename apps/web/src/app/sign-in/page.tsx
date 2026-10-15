import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <AuthShell
      headline="Say it once, on video."
      tagline="Record your screen and camera and share a link the moment you stop. Open source and yours to host."
    >
      <AuthForm mode="sign-in" />
    </AuthShell>
  )
}
