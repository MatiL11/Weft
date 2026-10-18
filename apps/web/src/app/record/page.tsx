import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AppHeader } from '@/components/app-header'
import { RecordStudio } from '@/components/recorder/record-studio'
import { fetchWorkspaces } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('recorder')
  return { title: t('title') }
}

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const result = await fetchWorkspaces(API_INTERNAL_URL, (await cookies()).toString())
  if (result.kind === 'unauthenticated') redirect('/sign-in?next=/record')
  const requested = (await searchParams).workspace
  // Only a workspace the user belongs to; the API also checks they may record there.
  const workspace =
    result.kind === 'ok' ? result.memberships.find((m) => m.workspace.id === requested) : undefined
  const t = await getTranslations('recorder')

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid max-w-6xl gap-8 px-6 pt-8 pb-20 sm:px-10">
        <div className="grid gap-1">
          <Link
            href={workspace ? `/?workspace=${workspace.workspace.id}` : '/'}
            className="w-fit text-sm text-muted transition-colors hover:text-fg"
          >
            ← {t('back')}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        </div>
        <RecordStudio workspaceId={workspace?.workspace.id} />
      </main>
    </div>
  )
}
