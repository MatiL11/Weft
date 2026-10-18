import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthForm } from '@/components/auth-form'
import { AuthShell } from '@/components/auth-shell'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { safeNextPath } from '@/lib/safe-next'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('signIn') }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const next = safeNextPath((await searchParams).next)
  const t = await getTranslations('auth')
  return (
    <AuthShell headline={t('headline')} tagline={t('tagline')} toolbar={<LocaleSwitcher />}>
      <AuthForm mode="sign-in" next={next} />
    </AuthShell>
  )
}
