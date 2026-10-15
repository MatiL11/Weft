import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'

export const metadata: Metadata = { title: 'Create account' }

export default function SignUpPage() {
  return (
    <AuthShell
      headline="Say it once, on video."
      tagline="Record your screen and camera and share a link the moment you stop. Open source and yours to host."
    >
      <AuthForm mode="sign-up" />
    </AuthShell>
  )
}
