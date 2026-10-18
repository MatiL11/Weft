import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AppHeader } from '@/components/app-header'
import { MembersManager } from '@/components/members/members-manager'
import { fetchAs, fetchSessionUserId, type Roster } from '@/lib/members'
import { fetchWorkspaces } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('members'))('title') }
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const cookieHeader = (await cookies()).toString()
  const workspaces = await fetchWorkspaces(API_INTERNAL_URL, cookieHeader)
  if (workspaces.kind === 'unauthenticated') redirect('/sign-in?next=/members')
  const requested = (await searchParams).workspace
  const memberships = workspaces.kind === 'ok' ? workspaces.memberships : []
  const current = memberships.find((m) => m.workspace.id === requested) ?? memberships[0]
  const t = await getTranslations('members')

  const roster = current
    ? await fetchAs<Roster>(
        `${API_INTERNAL_URL}/api/workspaces/${encodeURIComponent(current.workspace.id)}/members`,
        cookieHeader,
      )
    : ({ kind: 'not_found' } as const)
  const viewerId = await fetchSessionUserId(API_INTERNAL_URL, cookieHeader)

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto grid max-w-3xl gap-8 px-6 pt-12 pb-20 sm:px-10">
        <div className="grid gap-1">
          <Link
            href={current ? `/?workspace=${current.workspace.id}` : '/'}
            className="w-fit text-sm text-muted hover:text-fg"
          >
            ← {current?.workspace.name ?? t('back')}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        </div>
        {roster.kind === 'ok' && viewerId ? (
          <MembersManager roster={roster.data} viewerId={viewerId} />
        ) : (
          <p role="alert" className="text-muted">
            {t('loadError')}
          </p>
        )}
      </main>
    </div>
  )
}
