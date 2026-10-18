'use client'

import type { VideoView } from '@/lib/video-summary'
import { useTranscript } from './use-transcript'
import { useViewTracking } from './use-view-tracking'
import { VideoPlayer } from './video-player'

interface EmbedPlayerProps {
  video: VideoView
  autoPlay: boolean
  muted: boolean
  startAt: number
}

/** The full-frame player of /embed pages, with captions when the video has them. */
export function EmbedPlayer({ video, autoPlay, muted, startAt }: EmbedPlayerProps) {
  const transcript = useTranscript(video.captions?.transcriptUrl)
  const trackView = useViewTracking(video.id, !video.isOwner && video.status === 'ready')
  return (
    <VideoPlayer
      fill
      playlistUrl={video.playback.playlistUrl}
      isLive={video.status === 'recording'}
      skip={video.playback.skip}
      posterUrl={video.posterUrl}
      thumbnails={video.thumbnails}
      autoPlay={autoPlay}
      muted={muted}
      startAt={startAt}
      captions={transcript?.segments}
      onTimeChange={trackView}
    />
  )
}
