import Link from 'next/link'
import { getFormatter, getTranslations } from 'next-intl/server'
import { formatDuration } from '@/lib/recording-format'
import type { VideoView } from '@/lib/video-summary'

interface VideoCardProps {
  video: VideoView
  /** The newest video gets a larger card. */
  isFeatured: boolean
  now: Date
}

export async function VideoCard({ video, isFeatured, now }: VideoCardProps) {
  const t = await getTranslations()
  const format = await getFormatter()
  const isRecording = video.status === 'recording'
  const isProcessing =
    video.owner?.renderState === 'queued' || video.owner?.renderState === 'processing'

  return (
    <Link
      href={`/v/${video.id}`}
      className={`group grid content-start gap-3 rounded-2xl ${isFeatured ? 'sm:col-span-2 lg:row-span-2' : ''}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-surface-sunken">
        {video.posterUrl ? (
          // A plain img: the poster URL redirects to storage, which next/image would not follow.
          <img
            src={video.posterUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="size-3 rounded-full bg-accent/60" aria-hidden="true" />
          </div>
        )}
        {(isRecording || isProcessing) && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur">
            <span className="pulse-dot size-1.5 rounded-full bg-accent" aria-hidden="true" />
            {isRecording ? t('dashboard.recording') : t('dashboard.processing')}
          </span>
        )}
        {video.durationMs !== null && !isRecording && (
          <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white tabular-nums">
            {formatDuration(video.durationMs)}
          </span>
        )}
      </div>
      <div className="grid gap-1 px-0.5">
        <h3
          className={`line-clamp-2 font-medium tracking-tight decoration-accent decoration-2 underline-offset-4 group-hover:underline ${isFeatured ? 'text-lg' : ''}`}
        >
          {video.title}
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <time dateTime={video.createdAt}>
            {format.relativeTime(new Date(video.createdAt), now)}
          </time>
          {video.privacy !== 'link' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t(`share.privacy.${video.privacy}`)}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  )
}
