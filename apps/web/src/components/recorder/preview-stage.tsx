'use client'

import {
  BUBBLE_FRACTION,
  BUBBLE_MARGIN_FRACTION,
  type BubbleOptions,
  type RecordingMode,
} from '@weft/recorder/core'
import { useEffect, useRef, type CSSProperties } from 'react'

interface PreviewStageProps {
  mode: RecordingMode
  camera: MediaStream | null
  bubble: BubbleOptions
  cameraPlaceholder: string
}

function LiveVideo({ stream, className }: { stream: MediaStream; className: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} autoPlay muted playsInline className={className} />
}

/**
 * 16:9 mock of the output. The bubble uses the compositor's own proportions (relative to the
 * short side, i.e. the stage height) so the preview matches the recording.
 */
export function PreviewStage({ mode, camera, bubble, cameraPlaceholder }: PreviewStageProps) {
  const diameter = BUBBLE_FRACTION[bubble.size] * 100
  const margin = BUBBLE_MARGIN_FRACTION * 100
  const [vertical, horizontal] = bubble.position.split('-') as ['top' | 'bottom', 'left' | 'right']
  const bubbleStyle: CSSProperties = {
    width: `${diameter}cqh`,
    height: `${diameter}cqh`,
    [vertical]: `${margin}cqh`,
    [horizontal]: `${margin}cqh`,
  }

  return (
    <div className="@container relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-surface-sunken [container-type:size]">
      {mode !== 'camera' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 grid grid-cols-[1fr_2.2fr] gap-[4cqh] p-[6cqh]"
        >
          <div className="grid content-start gap-[2.5cqh]">
            {[80, 60, 70, 50, 65].map((w) => (
              <span
                key={w}
                className="h-[2.2cqh] rounded-full bg-line"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
          <div className="grid content-start gap-[3cqh]">
            <span className="h-[34cqh] rounded-[2cqh] bg-line" />
            {[100, 85, 70].map((w) => (
              <span
                key={w}
                className="h-[2.2cqh] rounded-full bg-line"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {mode === 'camera' ? (
        camera ? (
          <LiveVideo
            stream={camera}
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">
            {cameraPlaceholder}
          </div>
        )
      ) : (
        mode === 'screen-camera' && (
          <div
            className="absolute overflow-hidden rounded-full border-[0.6cqh] border-white/90 bg-line-strong shadow-panel transition-all duration-300 ease-(--ease-out-expo)"
            style={bubbleStyle}
          >
            {camera && (
              <LiveVideo stream={camera} className="size-full -scale-x-100 object-cover" />
            )}
          </div>
        )
      )}
    </div>
  )
}
