import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Logo } from '@/components/logo'
import { VideoPlayer } from '@/components/player/video-player'
import { formatDuration } from '@/lib/recording-format'
import { fetchVideoSummary } from '@/lib/video-summary'

export const dynamic = 'force-dynamic'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

interface SharePageProps {
  params: Promise<{ id: string }>
}

async function load(id: string) {
  return fetchVideoSummary(API_INTERNAL_URL, id, (await cookies()).toString())
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const result = await load((await params).id)
  if (result.kind !== 'ok') return { title: (await getTranslations('share'))('notFoundTitle') }
  return {
    title: result.video.title,
    // Shared links are unlisted: keep them out of search engines.
    robots: { index: false, follow: false },
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params
  const result = await load(id)
  const t = await getTranslations('share')
  const format = await getFormatter()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <LocaleSwitcher />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 pt-8 pb-20 sm:px-10">
        {result.kind === 'ok' ? (
          <>
            <VideoPlayer
              playlistUrl={`/api/videos/${result.video.id}/playlist.m3u8`}
              isLive={result.video.status === 'recording'}
            />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {result.video.title}
                </h1>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  {result.video.status === 'recording' ? (
                    <span className="flex items-center gap-1.5 font-medium text-accent">
                      <span
                        className="pulse-dot size-2 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {t('live')}
                    </span>
                  ) : (
                    result.video.durationMs !== null && (
                      <span className="font-mono">{formatDuration(result.video.durationMs)}</span>
                    )
                  )}
                  <span>
                    {t('recordedOn', {
                      date: format.dateTime(new Date(result.video.createdAt), {
                        dateStyle: 'long',
                      }),
                    })}
                  </span>
                </p>
                {result.video.status === 'recording' && (
                  <p className="text-sm text-muted">{t('liveHint')}</p>
                )}
              </div>
              {!result.video.isOwner && (
                <Link
                  href="/sign-up"
                  className="flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-line-strong"
                >
                  <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
                  {t('cta')}
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="grid justify-items-start gap-2 py-16">
            <h1 className="text-2xl font-semibold tracking-tight">
              {result.kind === 'not_found' ? t('notFoundTitle') : t('playerError')}
            </h1>
            {result.kind === 'not_found' && <p className="text-muted">{t('notFoundBody')}</p>}
          </div>
        )}
      </main>
    </div>
  )
}
