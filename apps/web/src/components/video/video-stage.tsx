'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { formatDuration } from '@/lib/recording-format'
import type { VideoView } from '@/lib/video-summary'
import { CopyField } from '../ui/copy-field'
import { useTranscript } from '../player/use-transcript'
import { VideoPlayer, type PlayerHandle } from '../player/video-player'
import { DeleteVideo } from './delete-video'
import { OwnerCard } from './owner-card'
import { PrivacyForm } from './privacy-form'
import { RenderStatus } from './render-status'
import { TitleEditor } from './title-editor'
import { TranscriptPanel } from './transcript-panel'
import { TranscriptionSettings } from './transcription-settings'
import { TrimEditor } from './trim-editor'

interface VideoStageProps {
  video: VideoView
  shareUrl: string
  embedCode: string
  /** Seconds into the video (from ?t=). */
  startAt: number
}

/** The share page body: player, title and, for the owner, the editing tools. */
export function VideoStage({ video, shareUrl, embedCode, startAt }: VideoStageProps) {
  const t = useTranslations('share')
  const format = useFormatter()
  const playerRef = useRef<PlayerHandle>(null)
  const isLive = video.status === 'recording'
  const { playback } = video
  // A new render or trim changes what the playlist serves, so start a fresh player.
  const playerKey = `${playback.processed}-${playback.skip?.startMs}-${playback.skip?.endMs}-${video.posterUrl}`
  const transcript = useTranscript(video.captions?.transcriptUrl)
  const [currentMs, setCurrentMs] = useState(0)

  const player = (
    <VideoPlayer
      key={playerKey}
      ref={playerRef}
      playlistUrl={playback.playlistUrl}
      isLive={isLive}
      skip={playback.skip}
      posterUrl={video.posterUrl}
      thumbnails={video.thumbnails}
      startAt={startAt}
      captions={transcript?.segments}
      onTimeChange={(seconds) => setCurrentMs(seconds * 1000)}
    />
  )

  return (
    <div className="grid gap-6">
      {transcript && video.captions ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {player}
          {/* Out of the flow, so the row is as tall as the player and the list scrolls. */}
          <div className="relative h-96 lg:h-auto">
            <TranscriptPanel
              transcript={transcript}
              currentMs={currentMs}
              vttUrl={video.captions.vttUrl}
              onSeek={(ms) => playerRef.current?.seek(ms / 1000)}
            />
          </div>
        </div>
      ) : (
        player
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 flex-1 gap-1.5">
          {video.isOwner && !isLive ? (
            <TitleEditor videoId={video.id} title={video.title} />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{video.title}</h1>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {isLive ? (
              <span className="flex items-center gap-1.5 font-medium text-accent">
                <span className="pulse-dot size-2 rounded-full bg-accent" aria-hidden="true" />
                {t('live')}
              </span>
            ) : (
              video.durationMs !== null && (
                <span className="font-mono">{formatDuration(video.durationMs)}</span>
              )
            )}
            <span>
              {t('recordedOn', {
                date: format.dateTime(new Date(video.createdAt), { dateStyle: 'long' }),
              })}
            </span>
            {video.isOwner && (
              <span className="rounded-md border border-line px-1.5 py-0.5 text-xs">
                {t(`privacy.${video.privacy}`)}
              </span>
            )}
          </p>
          {isLive && <p className="text-sm text-muted">{t('liveHint')}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {video.downloadUrl && (
            <a
              href={video.downloadUrl}
              className="flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-line-strong"
            >
              {t('download')}
            </a>
          )}
          {!video.isOwner && (
            <Link
              href="/sign-up"
              className="flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-line-strong"
            >
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              {t('cta')}
            </Link>
          )}
        </div>
      </div>

      {video.owner && !isLive && (
        <OwnerTools
          video={video}
          owner={video.owner}
          shareUrl={shareUrl}
          embedCode={embedCode}
          playerTimeMs={() => {
            const seconds = playerRef.current?.currentTime()
            return seconds === undefined ? null : (video.owner?.trim?.startMs ?? 0) + seconds * 1000
          }}
        />
      )}
    </div>
  )
}

interface OwnerToolsProps {
  video: VideoView
  owner: NonNullable<VideoView['owner']>
  shareUrl: string
  embedCode: string
  playerTimeMs: () => number | null
}

function OwnerTools({ video, owner, shareUrl, embedCode, playerTimeMs }: OwnerToolsProps) {
  const t = useTranslations('video.owner')
  // The filmstrip needs thumbnails that span the whole, untrimmed recording.
  const filmstrip = video.playback.processed && owner.trim === null ? video.thumbnails : null

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <RenderStatus videoId={video.id} state={owner.renderState} />
        {owner.recordingDurationMs !== null && (
          <TrimEditor
            key={`${owner.trim?.startMs}-${owner.trim?.endMs}`}
            videoId={video.id}
            durationMs={owner.recordingDurationMs}
            trim={owner.trim}
            thumbnails={filmstrip}
            playerTimeMs={playerTimeMs}
          />
        )}
        {video.playback.processed && (
          <TranscriptionSettings
            videoId={video.id}
            state={owner.transcriptionState}
            language={owner.transcriptLanguage}
          />
        )}
      </div>
      <div className="grid gap-4">
        <OwnerCard id="share-title" title={t('share.title')}>
          <CopyField id="share-link" label={t('share.link')} value={shareUrl} />
          <CopyField
            id="embed-code"
            label={t('share.embed')}
            value={embedCode}
            hint={video.privacy === 'link' ? t('share.embedHint') : t('share.embedNeedsLink')}
            copyLabel={t('share.copyCode')}
            multiline
          />
        </OwnerCard>
        <PrivacyForm videoId={video.id} privacy={video.privacy} hasPassword={owner.hasPassword} />
        <DeleteVideo videoId={video.id} />
      </div>
    </div>
  )
}
