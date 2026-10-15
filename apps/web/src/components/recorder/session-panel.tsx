'use client'

import type { Recorder } from '@weft/recorder'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { formatDuration } from '@/lib/recording-format'

interface SessionPanelProps {
  recorder: Recorder
  onStop: () => void
  onDiscard: () => void
}

/** Live view while recording: composited preview, timer and controls. */
export function SessionPanel({ recorder, onStop, onDiscard }: SessionPanelProps) {
  const t = useTranslations('recorder.session')
  const snapshot = useSyncExternalStore(
    recorder.subscribe,
    recorder.getSnapshot,
    recorder.getSnapshot,
  )
  const previewRef = useRef<HTMLDivElement>(null)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)

  useEffect(() => {
    const host = previewRef.current
    const canvas = recorder.previewCanvas
    if (!host) return
    canvas.className = 'block size-full object-contain'
    host.appendChild(canvas)
    return () => canvas.remove()
  }, [recorder])

  const { phase } = snapshot
  const isPaused = phase === 'paused'
  const isFinishing = phase === 'finishing'
  const countdownSeconds = Math.ceil(snapshot.countdownRemainingMs / 1000)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[#111014]">
        <div ref={previewRef} className="aspect-video w-full" />
        {phase === 'countdown' && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 text-white backdrop-blur-sm">
            <div className="grid justify-items-center gap-2" aria-live="assertive">
              <span className="text-sm font-medium text-white/80">{t('startsIn')}</span>
              <span
                key={countdownSeconds}
                className="rise font-mono text-8xl font-semibold tabular-nums"
              >
                {countdownSeconds}
              </span>
            </div>
          </div>
        )}
        {isFinishing && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 text-white backdrop-blur-sm">
            <span className="font-medium" role="status">
              {t('finishing')}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-xs font-medium tracking-wider ${
              isPaused ? 'bg-surface-sunken text-muted' : 'bg-accent-soft text-accent'
            }`}
          >
            <span
              className={`size-2 rounded-full ${isPaused ? 'bg-muted' : 'pulse-dot bg-accent'}`}
              aria-hidden="true"
            />
            {isPaused ? t('paused') : t('rec')}
          </span>
          <span className="font-mono text-2xl tabular-nums" role="timer" aria-live="off">
            {formatDuration(snapshot.elapsedMs)}
          </span>
          <span className="hidden text-sm text-muted sm:inline">
            {t('remaining', { time: formatDuration(snapshot.limitMs - snapshot.elapsedMs) })}
          </span>
        </div>

        {isConfirmingDiscard ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t('confirmDiscard')}
          >
            <span className="text-sm font-medium">{t('confirmDiscard')}</span>
            <button
              type="button"
              onClick={() => setIsConfirmingDiscard(false)}
              className="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-muted hover:bg-surface-sunken hover:text-fg"
            >
              {t('confirmDiscardNo')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="h-10 cursor-pointer rounded-xl bg-danger px-4 text-sm font-medium text-white hover:opacity-90"
            >
              {t('confirmDiscardYes')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConfirmingDiscard(true)}
              disabled={isFinishing}
              className="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-fg disabled:opacity-50"
            >
              {t('discard')}
            </button>
            <button
              type="button"
              onClick={() => (isPaused ? recorder.resume() : recorder.pause())}
              disabled={phase !== 'recording' && !isPaused}
              className="h-10 cursor-pointer rounded-xl border border-line px-4 text-sm font-medium transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPaused ? t('resume') : t('pause')}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={phase === 'countdown' || isFinishing}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary transition-[background-color,transform] hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="size-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
              {t('stop')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
