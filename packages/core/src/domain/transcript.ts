/** Transcripts of a video's speech, made by a speech recognizer after each render. */
import { DomainError } from './errors'

/** none: nothing requested yet · no_audio: the video has no sound to transcribe. */
export type TranscriptionState = 'none' | 'queued' | 'processing' | 'ready' | 'failed' | 'no_audio'

/** Languages the owner can pick; 'auto' lets the recognizer detect it. */
export const TRANSCRIPT_LANGUAGES = ['auto', 'en', 'es', 'pt', 'fr', 'de', 'it'] as const
export type TranscriptLanguage = (typeof TRANSCRIPT_LANGUAGES)[number]

export function isTranscriptLanguage(value: string): value is TranscriptLanguage {
  return (TRANSCRIPT_LANGUAGES as readonly string[]).includes(value)
}

export function validateTranscriptLanguage(value: string): TranscriptLanguage {
  if (!isTranscriptLanguage(value)) {
    throw new DomainError(
      'video.language_invalid',
      `Language must be one of ${TRANSCRIPT_LANGUAGES.join(', ')}.`,
    )
  }
  return value
}

export interface TranscriptSegment {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

export interface Transcript {
  readonly videoId: string
  /** The render whose timeline the timestamps follow. */
  readonly renderVersion: number
  /** Spoken language (ISO 639-1), as requested or detected. */
  readonly language: string
  readonly segments: readonly TranscriptSegment[]
  readonly createdAt: Date
}

/**
 * Recognizers label silence and sounds like "[BLANK_AUDIO]", "(música)" or "♪ ♪". A segment that
 * is only such a label isn't speech; "(laughs) okay, let's start" is.
 */
const NON_SPEECH = /^(\[[^[\]]*\]|\([^()]*\)|\*[^*]*\*|[♪\s]+)$/

/** Cleans recognizer output: trimmed text, no non-speech labels, ordered, within the video. */
export function normalizeSegments(
  segments: readonly TranscriptSegment[],
  durationMs: number,
): TranscriptSegment[] {
  return segments
    .map((s) => ({
      startMs: Math.max(0, Math.round(s.startMs)),
      endMs: Math.min(durationMs, Math.round(s.endMs)),
      text: s.text.replace(/\s+/g, ' ').trim(),
    }))
    .filter((s) => s.text.length > 0 && !NON_SPEECH.test(s.text) && s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs)
}

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`
}

/** Escapes cue text so it can't be read as WebVTT markup or a cue timing line. */
const escapeCue = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** WebVTT captions for <track> elements and other players. */
export function buildWebVtt(segments: readonly TranscriptSegment[]): string {
  const cues = segments.map(
    (s, i) => `${i + 1}\n${vttTime(s.startMs)} --> ${vttTime(s.endMs)}\n${escapeCue(s.text)}`,
  )
  return ['WEBVTT', ...cues].join('\n\n') + '\n'
}

/** Plain text of the whole transcript. */
export function transcriptText(segments: readonly TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(' ')
}
