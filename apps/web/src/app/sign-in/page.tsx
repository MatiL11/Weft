import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { LocaleSwitcher } from '@/components/locale-switcher'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('signIn') }
}

export default async function SignInPage() {
  const t = await getTranslations('auth')
  return (
    <AuthShell headline={t('headline')} tagline={t('tagline')} toolbar={<LocaleSwitcher />}>
      <AuthForm mode="sign-in" />
    </AuthShell>
  )
}
