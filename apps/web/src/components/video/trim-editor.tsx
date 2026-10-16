'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { spriteTile } from '@/lib/player-timeline'
import { constrainTrim, formatPrecise, trimToSave } from '@/lib/trim'
import { updateVideo } from '@/lib/video-api'
import type { ThumbnailSprite, TrimRange } from '@/lib/video-summary'
import { OwnerCard } from './owner-card'

interface TrimEditorProps {
  videoId: string
  /** Length of the whole recording. */
  durationMs: number
  trim: TrimRange | null
  /** Thumbnails covering the whole recording, if available, for the filmstrip. */
  thumbnails: ThumbnailSprite | null
  /** Current player position on the recording's timeline, in ms. */
  playerTimeMs: () => number | null
}

type Edge = 'start' | 'end'

const FINE_STEP_MS = 100
const COARSE_STEP_MS = 1000
const FILMSTRIP_FRAMES = 10
const TRACK_HEIGHT = 56

/** Cuts the start and end of the recording. Non-destructive: it can always be undone. */
export function TrimEditor({
  videoId,
  durationMs,
  trim,
  thumbnails,
  playerTimeMs,
}: TrimEditorProps) {
  const t = useTranslations('video.owner.trim')
  const router = useRouter()
  const trackRef = useRef<HTMLDivElement>(null)
  const saved = trim ?? { startMs: 0, endMs: durationMs }
  const [range, setRange] = useState<TrimRange>(saved)
  const [dragging, setDragging] = useState<Edge | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  const isDirty = range.startMs !== saved.startMs || range.endMs !== saved.endMs
  const percent = (ms: number) => `${(ms / durationMs) * 100}%`

  const move = (edge: Edge, ms: number) =>
    setRange((current) =>
      constrainTrim(
        edge === 'start' ? { ...current, startMs: ms } : { ...current, endMs: ms },
        durationMs,
        edge,
      ),
    )

  const msAtPointer = (event: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return ((event.clientX - rect.left) / rect.width) * durationMs
  }

  function handleKey(edge: Edge, event: KeyboardEvent) {
    const step = event.shiftKey ? COARSE_STEP_MS : FINE_STEP_MS
    const current = edge === 'start' ? range.startMs : range.endMs
    const deltas: Record<string, number> = {
      ArrowLeft: -step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowUp: step,
    }
    const delta = deltas[event.key]
    if (delta === undefined) return
    event.preventDefault()
    move(edge, current + delta)
  }

  function setAtPlayer(edge: Edge) {
    const ms = playerTimeMs()
    if (ms !== null) move(edge, ms)
  }

  async function save() {
    setStatus('saving')
    try {
      await updateVideo(videoId, { trim: trimToSave(range, durationMs) })
      setStatus('idle')
      router.refresh()
    } catch {
      setStatus('error')
    }
  }

  const handle = (edge: Edge) => {
    const ms = edge === 'start' ? range.startMs : range.endMs
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={t(edge)}
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={ms}
        aria-valuetext={formatPrecise(ms)}
        onKeyDown={(e) => handleKey(edge, e)}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(edge)
        }}
        onPointerMove={(e) => dragging === edge && move(edge, msAtPointer(e))}
        onPointerUp={() => setDragging(null)}
        className={`absolute inset-y-0 z-10 flex w-4 cursor-ew-resize touch-none items-center justify-center bg-accent text-on-accent shadow-md transition-transform focus-visible:outline-offset-2 ${
          edge === 'start' ? '-translate-x-full rounded-l-lg' : 'rounded-r-lg'
        } ${dragging === edge ? 'scale-y-105' : ''}`}
        style={{ left: percent(ms) }}
      >
        <span className="h-5 w-0.5 rounded-full bg-on-accent/70" aria-hidden="true" />
      </div>
    )
  }

  return (
    <OwnerCard
      id="trim-title"
      title={t('title')}
      description={t('description')}
      aside={
        <span className="shrink-0 rounded-lg bg-surface-sunken px-2 py-1 font-mono text-xs tabular-nums">
          {formatPrecise(range.endMs - range.startMs)}
        </span>
      }
    >
      <div className="px-4">
        <div
          ref={trackRef}
          className="relative overflow-hidden rounded-lg bg-surface-sunken"
          style={{ height: TRACK_HEIGHT }}
        >
          {thumbnails && <Filmstrip sprite={thumbnails} durationMs={durationMs} />}
          {/* Cut parts are dimmed and hatched. */}
          <div
            className="absolute inset-y-0 left-0 bg-bg/75 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--line)_6px_7px)]"
            style={{ width: percent(range.startMs) }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-bg/75 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--line)_6px_7px)]"
            style={{ left: percent(range.endMs) }}
          />
          <div
            className="absolute inset-y-0 border-y-2 border-accent"
            style={{ left: percent(range.startMs), right: `calc(100% - ${percent(range.endMs)})` }}
          />
        </div>
        <div className="relative -mt-[56px] h-[56px]">
          {handle('start')}
          {handle('end')}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 font-mono text-xs text-muted tabular-nums">
        <div className="flex gap-1.5">
          <dt>{t('start')}</dt>
          <dd className="text-fg">{formatPrecise(range.startMs)}</dd>
        </div>
        <div className="flex justify-end gap-1.5">
          <dt>{t('end')}</dt>
          <dd className="text-fg">{formatPrecise(range.endMs)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <SmallButton onClick={() => setAtPlayer('start')}>{t('startHere')}</SmallButton>
        <SmallButton onClick={() => setAtPlayer('end')}>{t('endHere')}</SmallButton>
        <SmallButton onClick={() => setRange({ startMs: 0, endMs: durationMs })}>
          {t('reset')}
        </SmallButton>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!isDirty || status === 'saving'}
          className="ml-auto h-9 cursor-pointer rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'saving' ? t('saving') : t('save')}
        </button>
      </div>
      {status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {t('error')}
        </p>
      )}
    </OwnerCard>
  )
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 cursor-pointer rounded-xl border border-line px-3 text-sm font-medium transition-colors hover:border-line-strong"
    >
      {children}
    </button>
  )
}

/** Evenly spaced frames from the thumbnail sprite, behind the trim track. */
function Filmstrip({ sprite, durationMs }: { sprite: ThumbnailSprite; durationMs: number }) {
  const scale = TRACK_HEIGHT / sprite.tileHeight
  return (
    <div className="absolute inset-0 flex opacity-80" aria-hidden="true">
      {Array.from({ length: FILMSTRIP_FRAMES }, (_, i) => {
        const tile = spriteTile(sprite, ((i + 0.5) / FILMSTRIP_FRAMES) * (durationMs / 1000))
        return (
          <div
            key={i}
            className="h-full flex-1 bg-no-repeat"
            style={{
              backgroundImage: `url(${sprite.url})`,
              backgroundSize: `${sprite.columns * sprite.tileWidth * scale}px auto`,
              backgroundPosition: `-${tile.x * scale}px -${tile.y * scale}px`,
            }}
          />
        )
      })}
    </div>
  )
}
