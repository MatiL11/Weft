'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { formatDuration } from '@/lib/recording-format'
import type { VideoView } from '@/lib/video-summary'
import { CopyField } from '../ui/copy-field'
import { timelineMarkers } from '@/lib/discussion'
import { addReaction } from '@/lib/video-api'
import { CommentsPanel } from '../discussion/comments-panel'
import { ReactionBar, ReactionBurst } from '../discussion/reaction-bar'
import { SidePanel } from '../discussion/side-panel'
import { useDiscussion } from '../discussion/use-discussion'
import { useTranscript } from '../player/use-transcript'
import { useViewTracking } from '../player/use-view-tracking'
import { VideoPlayer, type PlayerHandle } from '../player/video-player'
import { DeleteVideo } from './delete-video'
import { OwnerCard } from './owner-card'
import { PrivacyForm } from './privacy-form'
import { RenderStatus } from './render-status'
import { TitleEditor } from './title-editor'
import { VideoStats } from './video-stats'
import { TrashedBanner } from './trashed-banner'
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

  const { discussion, apply, incoming } = useDiscussion(video.id)
  const trackView = useViewTracking(video.id, !video.isOwner && !isLive)
  const markers = discussion ? timelineMarkers(discussion, video.durationMs ?? 0) : []
  const seek = (ms: number) => playerRef.current?.seek(ms / 1000)

  async function react(emoji: string) {
    try {
      apply({ type: 'reaction.created', reaction: await addReaction(video.id, emoji, currentMs) })
    } catch {
      // Reactions are fleeting; a failed one (e.g. rate limited) is simply dropped.
    }
  }

  return (
    <div className="grid gap-6">
      {video.trashedAt && video.isOwner && <TrashedBanner videoId={video.id} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative">
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
            markers={markers}
            onTimeChange={(seconds, info) => {
              setCurrentMs(seconds * 1000)
              trackView(seconds, info)
            }}
          />
          <ReactionBurst items={incoming} />
        </div>
        {/* Out of the flow, so the row is as tall as the player and the lists scroll. */}
        <div className="relative h-[28rem] lg:h-auto">
          <SidePanel
            commentCount={discussion?.comments.filter((c) => !c.deleted).length ?? 0}
            comments={
              <CommentsPanel
                videoId={video.id}
                discussion={discussion}
                apply={apply}
                currentMs={currentMs}
                onSeek={seek}
              />
            }
            transcript={
              transcript && video.captions ? (
                <TranscriptPanel
                  transcript={transcript}
                  currentMs={currentMs}
                  vttUrl={video.captions.vttUrl}
                  onSeek={seek}
                />
              ) : null
            }
          />
        </div>
      </div>

      <ReactionBar onReact={(emoji) => void react(emoji)} disabled={!discussion} />

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
        {video.durationMs !== null && (
          <VideoStats videoId={video.id} durationMs={video.durationMs} />
        )}
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
