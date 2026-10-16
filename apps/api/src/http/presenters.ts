import { playbackSource, visibleDurationMs, type Video } from '@weft/core'

/** Base path of a video's API resources; the web app proxies /api to this server. */
export const videoPath = (videoId: string) => `/api/videos/${videoId}`

export function shareUrl(publicUrl: string, videoId: string): string {
  return `${publicUrl.replace(/\/$/, '')}/v/${videoId}`
}

/** URL of a file of the video's latest render (versioned, so it can be cached). */
export function renderAssetPath(video: Video, file: string): string | null {
  return video.render ? `${videoPath(video.id)}/r/${video.render.version}/${file}` : null
}

/** What the API tells clients about a video; owner-only details are omitted for others. */
export function presentVideo(video: Video, viewerId: string | null) {
  const source = playbackSource(video)
  const isOwner = viewerId === video.ownerId
  return {
    id: video.id,
    title: video.title,
    status: video.status,
    privacy: video.privacy,
    createdAt: video.createdAt,
    durationMs: visibleDurationMs(video),
    isOwner,
    playback: {
      playlistUrl: `${videoPath(video.id)}/playlist.m3u8`,
      // While no render matches the trim, players hide what it cuts from the raw recording.
      skip: source.kind === 'raw' ? source.skip : null,
      processed: source.kind === 'render',
    },
    posterUrl: renderAssetPath(video, 'poster.jpg'),
    // Thumbnails only line up with the timeline of the render they came from.
    thumbnails:
      source.kind === 'render'
        ? { url: renderAssetPath(video, 'sprite.jpg'), ...source.render.sprite }
        : null,
    downloadUrl: source.kind === 'render' ? `${videoPath(video.id)}/download` : null,
    owner: isOwner
      ? {
          renderState: video.renderState,
          recordingDurationMs: video.durationMs,
          trim: video.trim,
          hasPassword: video.passwordHash !== null,
        }
      : null,
  }
}

export type VideoView = ReturnType<typeof presentVideo>
