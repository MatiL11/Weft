import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { AppHeader } from '@/components/app-header'
import { VideoCard } from '@/components/library/video-card'
import { errorKey } from '@/lib/error-keys'
import { fetchVideoList, type VideoListResult } from '@/lib/video-summary'
import { fetchWorkspaces, type WorkspaceMembership } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const cookieHeader = (await cookies()).toString()
  const result = await fetchWorkspaces(API_INTERNAL_URL, cookieHeader)
  if (result.kind === 'unauthenticated') redirect('/sign-in')
  const requested = (await searchParams).workspace
  const memberships = result.kind === 'ok' ? result.memberships : []
  // The workspace picked in the URL, or the first (personal) one.
  const current = memberships.find((m) => m.workspace.id === requested) ?? memberships[0]
  const library: VideoListResult = current
    ? await fetchVideoList(API_INTERNAL_URL, cookieHeader, current.workspace.id)
    : { kind: 'ok', videos: [] }
  const t = await getTranslations()

  return (
    <div className="min-h-dvh">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-20 sm:px-10">
        {result.kind === 'error' ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            {t(`errors.${errorKey(result.code)}`)}
          </p>
        ) : (
          <WorkspaceOverview current={current} memberships={memberships} library={library} />
        )}
      </main>
    </div>
  )
}

interface WorkspaceOverviewProps {
  current: WorkspaceMembership | undefined
  memberships: WorkspaceMembership[]
  library: VideoListResult
}

const CAN_RECORD = new Set(['owner', 'admin', 'member'])

async function WorkspaceOverview({ current, memberships, library }: WorkspaceOverviewProps) {
  const t = await getTranslations('dashboard')
  const others = memberships.filter((m) => m.workspace.id !== current?.workspace.id)

  if (!current) {
    return <p className="text-muted">{t('noWorkspace')}</p>
  }

  return (
    <div className="rise grid gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="font-mono text-xs tracking-wider text-muted uppercase">
            weft/{current.workspace.slug} · {t(`roles.${current.role}`)}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {current.workspace.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/members?workspace=${current.workspace.id}`}
            className="flex h-11 items-center rounded-xl border border-line px-4 font-medium transition-colors hover:border-line-strong"
          >
            {t('members')}
          </Link>
          {CAN_RECORD.has(current.role) && (
            <Link
              href={`/record?workspace=${current.workspace.id}`}
              className="flex h-11 items-center gap-2.5 rounded-xl bg-primary px-5 font-medium text-on-primary transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.98]"
            >
              <span className="size-2.5 rounded-full bg-accent" aria-hidden="true" />
              {t('newRecording')}
            </Link>
          )}
        </div>
      </div>

      <Library library={library} />

      {others.length > 0 && (
        <section aria-labelledby="other-workspaces-title" className="grid gap-3">
          <h2 id="other-workspaces-title" className="text-sm font-medium text-muted">
            {t('otherWorkspaces')}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {others.map((m) => (
              <li key={m.workspace.id}>
                <Link
                  href={`/?workspace=${m.workspace.id}`}
                  className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-surface-sunken"
                >
                  <span className="font-medium">{m.workspace.name}</span>
                  <span className="font-mono text-xs text-muted">{t(`roles.${m.role}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

async function Library({ library }: { library: VideoListResult }) {
  const t = await getTranslations('dashboard')

  if (library.kind !== 'ok') {
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
        {t('libraryError')}
      </p>
    )
  }

  if (library.videos.length === 0) {
    return (
      <section
        aria-labelledby="library-empty-title"
        className="grid gap-6 rounded-2xl border border-line bg-surface p-8 sm:grid-cols-[auto_1fr] sm:items-center sm:p-10"
      >
        <div className="grid size-16 place-items-center rounded-2xl bg-accent-soft">
          <span className="size-4 rounded-full bg-accent" />
        </div>
        <div className="grid max-w-xl gap-2">
          <h2 id="library-empty-title" className="text-xl font-semibold tracking-tight">
            {t('libraryEmptyTitle')}
          </h2>
          <p className="text-muted">{t('libraryEmptyBody')}</p>
        </div>
      </section>
    )
  }

  const now = new Date()
  return (
    <section aria-labelledby="library-title" className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h2 id="library-title" className="font-semibold tracking-tight">
          {t('library')}
        </h2>
        <span className="font-mono text-xs text-muted">
          {t('videoCount', { count: library.videos.length })}
        </span>
      </div>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {library.videos.map((video, index) => (
          <VideoCard key={video.id} video={video} isFeatured={index === 0} now={now} />
        ))}
      </div>
    </section>
  )
}
