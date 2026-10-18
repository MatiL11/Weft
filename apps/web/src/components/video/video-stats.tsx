'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { initialOf } from '@/lib/discussion'
import { fetchVideoStats, type VideoStats as Stats } from '@/lib/video-api'
import { OwnerCard } from './owner-card'
import { RetentionChart } from './retention-chart'

const REFRESH_MS = 30_000

/** Who watched the owner's video, how much, and where people stop. */
export function VideoStats({ videoId, durationMs }: { videoId: string; durationMs: number }) {
  const t = useTranslations('video.stats')
  const format = useFormatter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetchVideoStats(videoId)
        .then((data) => !cancelled && setStats(data))
        .catch(() => !cancelled && setHasError(true))
    void load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [videoId])

  const percent = (value: number) => `${Math.round(value * 100)}%`
  const tiles = stats
    ? [
        { label: t('views'), value: format.number(stats.views) },
        { label: t('unique'), value: format.number(stats.uniqueViewers) },
        { label: t('averageWatched'), value: percent(stats.averageWatched) },
        { label: t('completion'), value: percent(stats.completionRate) },
      ]
    : []
  const now = new Date()

  return (
    <OwnerCard id="stats-title" title={t('title')} description={t('description')}>
      {hasError && !stats && <p className="text-sm text-danger">{t('error')}</p>}
      {!stats && !hasError && <p className="text-sm text-muted">{t('loading')}</p>}
      {stats && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="grid gap-0.5 bg-surface px-4 py-3">
                <dt className="text-xs text-muted">{tile.label}</dt>
                <dd className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                  {tile.value}
                </dd>
              </div>
            ))}
          </dl>
          {stats.views === 0 ? (
            <p className="text-sm text-muted">{t('empty')}</p>
          ) : (
            <>
              <RetentionChart retention={stats.retention} durationMs={durationMs} />
              {stats.viewers.length > 0 && (
                <section aria-labelledby="viewers-title" className="grid gap-2">
                  <h3 id="viewers-title" className="text-sm font-medium">
                    {t('viewersTitle')}
                  </h3>
                  <ul className="grid gap-2">
                    {stats.viewers.map((viewer) => (
                      <li
                        key={viewer.viewerId}
                        className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2.5 text-sm"
                      >
                        <span
                          aria-hidden="true"
                          className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
                        >
                          {initialOf(viewer.name)}
                        </span>
                        <div className="grid min-w-0 gap-1">
                          <span className="truncate">{viewer.name}</span>
                          <span className="h-1 overflow-hidden rounded-full bg-surface-sunken">
                            <span
                              className="block h-full rounded-full bg-chart"
                              style={{ width: percent(viewer.watched) }}
                            />
                          </span>
                        </div>
                        <span className="text-right text-xs text-muted">
                          <span className="font-mono text-fg">{percent(viewer.watched)}</span>
                          <br />
                          {format.relativeTime(new Date(viewer.lastSeenAt), now)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {stats.anonymousViews > 0 && (
                <p className="text-xs text-muted">
                  {t('anonymous', { count: stats.anonymousViews })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </OwnerCard>
  )
}
