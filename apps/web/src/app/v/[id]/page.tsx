import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Logo } from '@/components/logo'
import { PasswordGate } from '@/components/video/password-gate'
import { VideoStage } from '@/components/video/video-stage'
import { loadVideo } from '@/lib/load-video'
import { embedSnippet, EMBED_SIZE, parseEmbedOptions } from '@/lib/share-meta'

export const dynamic = 'force-dynamic'

interface SharePageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { id } = await params
  const { result, origin } = await loadVideo(id)
  const t = await getTranslations('share')
  // Shared links are unlisted: keep them out of search engines.
  const robots = { index: false, follow: false }
  if (result.kind !== 'ok') {
    const title = result.kind === 'password_required' ? t('protectedTitle') : t('notFoundTitle')
    return { title, robots }
  }

  const { video } = result
  const pageUrl = `${origin}/v/${video.id}`
  const embedUrl = `${origin}/embed/${video.id}`
  const image = video.posterUrl ? `${origin}${video.posterUrl}` : undefined
  return {
    title: video.title,
    robots,
    alternates: {
      types: {
        'application/json+oembed': `${origin}/api/oembed?url=${encodeURIComponent(pageUrl)}`,
      },
    },
    openGraph: {
      type: 'video.other',
      url: pageUrl,
      title: video.title,
      siteName: 'Weft',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: 'player',
      title: video.title,
      images: image ? [image] : undefined,
      players: { playerUrl: embedUrl, streamUrl: embedUrl, ...EMBED_SIZE },
    },
  }
}

export default async function SharePage({ params, searchParams }: SharePageProps) {
  const { id } = await params
  const { result, origin } = await loadVideo(id)
  const { startAt } = parseEmbedOptions(await searchParams)
  const t = await getTranslations('share')

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-10">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <LocaleSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-8 pb-20 sm:px-10">
        {result.kind === 'ok' && (
          <VideoStage
            video={result.video}
            shareUrl={`${origin}/v/${result.video.id}`}
            embedCode={embedSnippet(origin, result.video.id)}
            startAt={startAt}
          />
        )}
        {result.kind === 'password_required' && <PasswordGate videoId={id} />}
        {(result.kind === 'not_found' || result.kind === 'error') && (
          <div className="grid justify-items-start gap-2 py-16">
            <h1 className="text-2xl font-semibold tracking-tight">
              {result.kind === 'not_found' ? t('notFoundTitle') : t('loadError')}
            </h1>
            {result.kind === 'not_found' && <p className="text-muted">{t('notFoundBody')}</p>}
          </div>
        )}
      </main>
    </div>
  )
}
