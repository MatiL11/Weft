import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { EmbedPlayer } from '@/components/player/embed-player'
import { loadVideo } from '@/lib/load-video'
import { parseEmbedOptions } from '@/lib/share-meta'

export const dynamic = 'force-dynamic'

interface EmbedPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: EmbedPageProps): Promise<Metadata> {
  const { result } = await loadVideo((await params).id)
  return {
    title: result.kind === 'ok' ? result.video.title : 'Weft',
    robots: { index: false, follow: false },
  }
}

/** Bare player for iframes: ?t=90&autoplay=1&muted=1&hide_title=1 */
export default async function EmbedPage({ params, searchParams }: EmbedPageProps) {
  const { id } = await params
  const { result, origin } = await loadVideo(id)
  const options = parseEmbedOptions(await searchParams)
  const t = await getTranslations('share')
  const watchUrl = `${origin}/v/${id}`

  if (result.kind !== 'ok') {
    // Protected videos can't be unlocked inside another site's frame; send viewers to Weft.
    const message =
      result.kind === 'password_required'
        ? t('embedProtected')
        : result.kind === 'not_found'
          ? t('notFoundTitle')
          : t('loadError')
    return (
      <main className="grid h-dvh place-items-center bg-[#0d0c0f] p-6 text-center text-white">
        <div className="grid justify-items-center gap-3">
          <p className="font-medium">{message}</p>
          {result.kind === 'password_required' && (
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline decoration-accent decoration-2 underline-offset-4"
            >
              {t('watchOnWeft')} ↗
            </a>
          )}
        </div>
      </main>
    )
  }

  const { video } = result
  return (
    <main className="relative h-dvh bg-[#0d0c0f]">
      <EmbedPlayer
        video={video}
        autoPlay={options.autoplay}
        muted={options.muted}
        startAt={options.startAt}
      />
      {!options.hideTitle && (
        <a
          href={`${watchUrl}${options.startAt ? `?t=${Math.floor(options.startAt)}` : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pt-3 pb-8 text-sm font-medium text-white"
        >
          <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span className="truncate">{video.title}</span>
        </a>
      )}
    </main>
  )
}
