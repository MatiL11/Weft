import type { BubblePosition, BubbleSize, RecordingMode } from '@weft/recorder/core'

export interface RecordingSettings {
  mode: RecordingMode
  bubblePosition: BubblePosition
  bubbleSize: BubbleSize
  countdown: boolean
  systemAudio: boolean
  /** null = browser default; for microphones, 'none' records without audio. */
  cameraId: string | null
  microphoneId: string | null
}

export const RECORDING_LIMIT_MINUTES = 60
export const COUNTDOWN_MS = 3_000

export const MODES: readonly RecordingMode[] = ['screen-camera', 'screen', 'camera']
export const BUBBLE_POSITIONS: readonly BubblePosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]
export const BUBBLE_SIZES: readonly BubbleSize[] = ['small', 'medium', 'large']

export const DEFAULT_SETTINGS: RecordingSettings = {
  mode: 'screen-camera',
  bubblePosition: 'bottom-left',
  bubbleSize: 'medium',
  countdown: true,
  systemAudio: false,
  cameraId: null,
  microphoneId: null,
}

export function modeUses(mode: RecordingMode): { screen: boolean; camera: boolean } {
  return { screen: mode !== 'camera', camera: mode !== 'screen' }
}

const isNullableString = (v: unknown) => v === null || typeof v === 'string'

/** Validates settings read back from storage, which may be stale or hand-edited. */
export function isRecordingSettings(value: unknown): value is RecordingSettings {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    MODES.includes(v.mode as RecordingMode) &&
    BUBBLE_POSITIONS.includes(v.bubblePosition as BubblePosition) &&
    BUBBLE_SIZES.includes(v.bubbleSize as BubbleSize) &&
    typeof v.countdown === 'boolean' &&
    typeof v.systemAudio === 'boolean' &&
    isNullableString(v.cameraId) &&
    isNullableString(v.microphoneId)
  )
}
