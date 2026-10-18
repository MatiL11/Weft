'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatClock, spriteTile } from '@/lib/player-timeline'
import type { TimelineMarker } from '@/lib/discussion'
import type { ThumbnailSprite } from '@/lib/video-summary'

interface SeekBarProps {
  /** Seconds, on the visible (trimmed) timeline. */
  time: number
  duration: number
  buffered: number
  thumbnails: ThumbnailSprite | null
  /** Comments and reactions along the timeline. */
  markers?: readonly TimelineMarker[]
  onSeek: (seconds: number) => void
}

const KEYBOARD_STEP_SECONDS = 5
const PREVIEW_WIDTH = 160

/** Scrubber with buffered range and a thumbnail preview where the pointer hovers. */
export function SeekBar({
  time,
  duration,
  buffered,
  thumbnails,
  markers = [],
  onSeek,
}: SeekBarProps) {
  const t = useTranslations('player')
  const trackRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ fraction: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const safeDuration = duration > 0 ? duration : 0
  const fractionOf = (seconds: number) => (safeDuration > 0 ? seconds / safeDuration : 0)
  const pointerFraction = (event: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    onSeek(pointerFraction(event) * safeDuration)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const fraction = pointerFraction(event)
    setHover({ fraction })
    if (isDragging) onSeek(fraction * safeDuration)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const targets: Record<string, number> = {
      ArrowLeft: time - KEYBOARD_STEP_SECONDS,
      ArrowRight: time + KEYBOARD_STEP_SECONDS,
      Home: 0,
      End: safeDuration,
    }
    const target = targets[event.key]
    if (target === undefined) return
    event.preventDefault()
    event.stopPropagation()
    onSeek(Math.min(safeDuration, Math.max(0, target)))
  }

  const hoverSeconds = hover ? hover.fraction * safeDuration : 0
  const tile = thumbnails && hover ? spriteTile(thumbnails, hoverSeconds) : null
  // The sprite's tiles are scaled to the preview's width.
  const scale = thumbnails ? PREVIEW_WIDTH / thumbnails.tileWidth : 1

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={t('seek')}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={t('position', { time: formatClock(time), total: formatClock(safeDuration) })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setIsDragging(false)}
      onPointerLeave={() => !isDragging && setHover(null)}
      onKeyDown={handleKeyDown}
      className="group/seek relative flex h-5 cursor-pointer touch-none items-center focus-visible:outline-offset-4"
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 group-hover/seek:h-1.5">
        <div
          className="absolute inset-y-0 left-0 bg-white/35"
          style={{ width: `${fractionOf(buffered) * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-accent"
          style={{ width: `${fractionOf(time) * 100}%` }}
        />
      </div>
      {markers.map((marker) => (
        <span
          key={`${marker.kind}-${marker.position}`}
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 ${
            marker.kind === 'comment'
              ? 'grid size-4 place-items-center rounded-full bg-accent text-[0.5625rem] font-semibold text-on-accent ring-2 ring-black/40'
              : 'text-xs leading-none'
          }`}
          style={{ left: `${marker.position * 100}%` }}
        >
          {marker.label}
          {marker.count > 1 && marker.kind === 'reaction' && (
            <span className="ml-px font-mono text-[0.5625rem] text-white/80">{marker.count}</span>
          )}
        </span>
      ))}
      <div
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow transition-transform duration-150 group-hover/seek:scale-100 group-focus-visible/seek:scale-100"
        style={{ left: `${fractionOf(time) * 100}%` }}
      />
      {hover && safeDuration > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-3 grid -translate-x-1/2 justify-items-center gap-1.5"
          style={{
            left: `clamp(${PREVIEW_WIDTH / 2}px, ${hover.fraction * 100}%, calc(100% - ${PREVIEW_WIDTH / 2}px))`,
          }}
        >
          {thumbnails && tile && (
            <div
              className="overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg"
              style={{
                width: PREVIEW_WIDTH,
                height: Math.round(thumbnails.tileHeight * scale),
                backgroundImage: `url(${thumbnails.url})`,
                backgroundPosition: `-${tile.x * scale}px -${tile.y * scale}px`,
                backgroundSize: `${thumbnails.columns * PREVIEW_WIDTH}px auto`,
              }}
            />
          )}
          <span className="rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white tabular-nums">
            {formatClock(hoverSeconds)}
          </span>
        </div>
      )}
    </div>
  )
}
