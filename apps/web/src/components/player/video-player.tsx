'use client'

import { useTranslations } from 'next-intl'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import {
  formatClock,
  PLAYBACK_RATES,
  toMediaTime,
  toVisibleTime,
  visibleWindow,
} from '@/lib/player-timeline'
import type { ThumbnailSprite, TrimRange } from '@/lib/video-summary'
import { PlayerIcon } from './icons'
import { SeekBar } from './seek-bar'
import { SpeedMenu } from './speed-menu'
import { useHls } from './use-hls'

export interface PlayerHandle {
  /** Seconds into the visible timeline. */
  currentTime(): number
  seek(visibleSeconds: number): void
}

export interface VideoPlayerProps {
  /** Same-origin HLS playlist URL (the API redirects media requests to storage). */
  playlistUrl: string
  isLive: boolean
  /** Parts of the media to hide (a trim not yet rendered). */
  skip: TrimRange | null
  posterUrl: string | null
  thumbnails: ThumbnailSprite | null
  autoPlay?: boolean
  muted?: boolean
  /** Seconds into the visible timeline to start from. */
  startAt?: number
  /** Fill the parent (embeds) instead of a rounded 16:9 frame. */
  fill?: boolean
  ref?: Ref<PlayerHandle>
}

const RATE_KEY = 'weft.playbackRate'
const CONTROLS_IDLE_MS = 2500
const SEEK_STEP_SECONDS = 5
const LONG_SEEK_STEP_SECONDS = 10
const VOLUME_STEP = 0.1
/** How close to the trim end counts as reaching it (timeupdate is coarse). */
const END_TOLERANCE_SECONDS = 0.05

interface MediaState {
  playing: boolean
  mediaTime: number
  mediaDuration: number
  bufferedEnd: number
  volume: number
  muted: boolean
  waiting: boolean
}

function readRate(): number {
  try {
    const stored = Number(localStorage.getItem(RATE_KEY))
    return (PLAYBACK_RATES as readonly number[]).includes(stored) ? stored : 1
  } catch {
    return 1
  }
}

function bufferedEndAt(video: HTMLVideoElement): number {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 0.5) return video.buffered.end(i)
  }
  return video.currentTime
}

export function VideoPlayer({
  playlistUrl,
  isLive,
  skip,
  posterUrl,
  thumbnails,
  autoPlay = false,
  muted: startMuted = false,
  startAt = 0,
  fill = false,
  ref,
}: VideoPlayerProps) {
  const t = useTranslations('player')
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasError, setHasError] = useState(false)
  const [state, setState] = useState<MediaState>({
    playing: false,
    mediaTime: 0,
    mediaDuration: 0,
    bufferedEnd: 0,
    volume: 1,
    muted: startMuted,
    waiting: false,
  })
  const [rate, setRate] = useState(1)
  const [hasStarted, setHasStarted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isIdle, setIsIdle] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useHls(videoRef, playlistUrl, () => setHasError(true))

  const visible = visibleWindow(skip, state.mediaDuration)
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const visibleTime = toVisibleTime(state.mediaTime, visible)
  const visibleDuration = visible.end - visible.start

  const sync = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const end = visibleRef.current.end
    // A trim that has not been rendered yet: stop where it ends.
    if (skip && end > 0 && !video.paused && video.currentTime >= end - END_TOLERANCE_SECONDS) {
      video.pause()
      video.currentTime = end
    }
    setState((previous) => ({
      ...previous,
      playing: !video.paused,
      mediaTime: video.currentTime,
      mediaDuration: Number.isFinite(video.duration) ? video.duration : previous.mediaDuration,
      bufferedEnd: bufferedEndAt(video),
      volume: video.volume,
      muted: video.muted,
    }))
  }, [skip])

  // Smooth progress while playing; media events cover everything else.
  useEffect(() => {
    if (!state.playing) return
    let frame = requestAnimationFrame(function tick() {
      sync()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [state.playing, sync])

  useEffect(() => {
    setRate(readRate())
    const onFullscreenChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate
  }, [rate])

  const seek = useCallback((visibleSeconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = toMediaTime(visibleSeconds, visibleRef.current)
    setState((previous) => ({ ...previous, mediaTime: video.currentTime }))
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      currentTime: () => toVisibleTime(videoRef.current?.currentTime ?? 0, visibleRef.current),
      seek,
    }),
    [seek],
  )

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = rate
    const start = toMediaTime(startAt, visibleWindow(skip, video.duration))
    if (start > 0) video.currentTime = start
    sync()
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) {
      video.pause()
      return
    }
    // Replaying from the (trimmed) end starts over from the beginning.
    if (visibleDuration > 0 && visibleTime >= visibleDuration - END_TOLERANCE_SECONDS) seek(0)
    void video.play().catch(() => {})
  }

  function changeRate(next: number) {
    setRate(next)
    try {
      localStorage.setItem(RATE_KEY, String(next))
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  function setVolume(volume: number) {
    const video = videoRef.current
    if (!video) return
    video.volume = Math.min(1, Math.max(0, volume))
    video.muted = video.volume === 0
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    if (!video.muted && video.volume === 0) video.volume = 0.5
  }

  async function toggleFullscreen() {
    const container = containerRef.current
    const video = videoRef.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (!container || !video) return
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
    } else if (container.requestFullscreen) {
      await container.requestFullscreen().catch(() => {})
    } else {
      // iOS Safari only lets the video element itself go fullscreen.
      video.webkitEnterFullscreen?.()
    }
  }

  function wake() {
    setIsIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIsIdle(true), CONTROLS_IDLE_MS)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) {
      return
    }
    const actions: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seek(visibleTime - SEEK_STEP_SECONDS),
      ArrowRight: () => seek(visibleTime + SEEK_STEP_SECONDS),
      j: () => seek(visibleTime - LONG_SEEK_STEP_SECONDS),
      l: () => seek(visibleTime + LONG_SEEK_STEP_SECONDS),
      ArrowUp: () => setVolume(state.volume + VOLUME_STEP),
      ArrowDown: () => setVolume(state.volume - VOLUME_STEP),
      m: toggleMute,
      f: () => void toggleFullscreen(),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    wake()
    action()
  }

  const showControls = !state.playing || !isIdle
  const frame = fill
    ? 'h-full w-full'
    : 'aspect-video w-full overflow-hidden rounded-2xl border border-line'

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={t('label')}
      onKeyDown={handleKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => setIsIdle(true)}
      className={`group/player relative isolate bg-[#0d0c0f] text-white focus-visible:outline-offset-4 ${frame} ${showControls ? '' : 'cursor-none'}`}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={posterUrl ?? undefined}
        autoPlay={autoPlay}
        muted={startMuted}
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => {
          setHasStarted(true)
          sync()
        }}
        onPause={sync}
        onSeeked={sync}
        onDurationChange={sync}
        onProgress={sync}
        onVolumeChange={sync}
        onWaiting={() => setState((s) => ({ ...s, waiting: true }))}
        onPlaying={() => setState((s) => ({ ...s, waiting: false }))}
        onCanPlay={() => setState((s) => ({ ...s, waiting: false }))}
        className="h-full w-full object-contain"
        data-live={isLive}
      />

      {!hasStarted && !hasError && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={t('play')}
          className="absolute inset-0 m-auto grid size-18 cursor-pointer place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_32px_-8px_rgb(0_0_0/0.6)] transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
        >
          <PlayerIcon name="play" className="ml-1 size-8" />
        </button>
      )}

      {state.waiting && state.playing && (
        <div
          className="pointer-events-none absolute inset-0 m-auto size-10 animate-spin rounded-full border-2 border-white/25 border-t-white"
          aria-hidden="true"
        />
      )}

      <div
        className={`absolute inset-x-0 bottom-0 grid gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-12 pb-2.5 transition-opacity duration-300 sm:px-4 ${
          showControls && hasStarted ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <SeekBar
          time={visibleTime}
          duration={visibleDuration}
          buffered={toVisibleTime(state.bufferedEnd, visible)}
          thumbnails={thumbnails}
          onSeek={seek}
        />
        <div className="flex items-center gap-1">
          <ControlButton label={state.playing ? t('pause') : t('play')} onClick={togglePlay}>
            <PlayerIcon name={state.playing ? 'pause' : 'play'} />
          </ControlButton>
          <div className="group/volume flex items-center">
            <ControlButton label={state.muted ? t('unmute') : t('mute')} onClick={toggleMute}>
              <PlayerIcon name={state.muted || state.volume === 0 ? 'muted' : 'volume'} />
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              onChange={(e) => setVolume(Number(e.currentTarget.value))}
              aria-label={t('volume')}
              className="hidden h-1 w-0 cursor-pointer accent-white opacity-0 transition-[width,opacity] duration-200 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100 group-hover/volume:w-20 group-hover/volume:opacity-100 sm:block"
            />
          </div>
          <span className="ml-1.5 font-mono text-xs text-white/85 tabular-nums">
            {formatClock(visibleTime)} <span className="text-white/45">/</span>{' '}
            {formatClock(visibleDuration)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <SpeedMenu rate={rate} onChange={changeRate} />
            <ControlButton
              label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              onClick={() => void toggleFullscreen()}
            >
              <PlayerIcon name={isFullscreen ? 'exitFullscreen' : 'enterFullscreen'} />
            </ControlButton>
          </div>
        </div>
      </div>

      {hasError && (
        <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
          <p role="alert" className="max-w-sm text-sm">
            {t('error')}
          </p>
        </div>
      )}
    </div>
  )
}

export function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 cursor-pointer place-items-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  )
}
