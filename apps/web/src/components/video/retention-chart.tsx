'use client'

import { useTranslations } from 'next-intl'
import { useState, type PointerEvent } from 'react'
import { formatClock } from '@/lib/player-timeline'
import { formatPrecise } from '@/lib/trim'

interface RetentionChartProps {
  /** Share of views (0–1) that watched each twentieth of the video. */
  retention: number[]
  durationMs: number
}

const WIDTH = 600
const HEIGHT = 180
const PAD = { top: 12, right: 8, bottom: 22, left: 34 }
const GRID = [0, 0.5, 1]

/** How many viewers were still watching along the video (single series: area + line). */
export function RetentionChart({ retention, durationMs }: RetentionChartProps) {
  const t = useTranslations('video.stats')
  const [hover, setHover] = useState<number | null>(null)
  const n = retention.length
  const plotW = WIDTH - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + ((i + 0.5) / n) * plotW
  const y = (value: number) => PAD.top + (1 - value) * plotH
  // Bucket centers, held flat out to both edges so the curve covers the whole video.
  const points = [
    `${PAD.left},${y(retention[0] ?? 0)}`,
    ...retention.map((value, i) => `${x(i)},${y(value)}`),
    `${PAD.left + plotW},${y(retention.at(-1) ?? 0)}`,
  ].join(' ')
  const area = `${PAD.left},${y(0)} ${points} ${PAD.left + plotW},${y(0)}`
  // Short videos have sub-second twentieths, so show tenths there.
  const time = (ms: number) => (durationMs < 120_000 ? formatPrecise(ms) : formatClock(ms / 1000))
  const rangeOf = (i: number) => `${time((i / n) * durationMs)}–${time(((i + 1) / n) * durationMs)}`

  function handleMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.floor(((ratio - PAD.left) / plotW) * n)
    setHover(index >= 0 && index < n ? index : null)
  }

  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium">{t('retentionTitle')}</figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-none overflow-visible"
          role="img"
          aria-label={t('retentionLabel')}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {GRID.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(value)}
                y2={y(value)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-muted font-mono text-[10px]"
              >
                {Math.round(value * 100)}%
              </text>
            </g>
          ))}
          <text x={PAD.left} y={HEIGHT - 4} className="fill-muted font-mono text-[10px]">
            0:00
          </text>
          <text
            x={PAD.left + plotW}
            y={HEIGHT - 4}
            textAnchor="end"
            className="fill-muted font-mono text-[10px]"
          >
            {formatClock(durationMs / 1000)}
          </text>
          <polygon points={area} className="fill-chart" fillOpacity={0.1} />
          <polyline
            points={points}
            fill="none"
            className="stroke-chart"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={y(0)}
                className="stroke-line-strong"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(retention[hover] ?? 0)}
                r={4.5}
                className="fill-chart stroke-surface"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-panel"
            style={{ left: `${(x(hover) / WIDTH) * 100}%` }}
          >
            <span className="font-mono text-muted">{rangeOf(hover)}</span>{' '}
            <span className="font-medium">
              {t('stillWatching', { percent: Math.round((retention[hover] ?? 0) * 100) })}
            </span>
          </div>
        )}
      </div>
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">{t('showTable')}</summary>
        <table className="mt-2 w-full text-left font-mono text-xs">
          <thead>
            <tr>
              <th className="py-1 font-medium">{t('moment')}</th>
              <th className="py-1 text-right font-medium">{t('watching')}</th>
            </tr>
          </thead>
          <tbody>
            {retention.map((value, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">{rangeOf(i)}</td>
                <td className="py-1 text-right">{Math.round(value * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
