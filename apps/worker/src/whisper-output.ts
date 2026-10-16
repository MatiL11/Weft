import type { TranscriptSegment } from '@weft/core'
import { z } from 'zod'

/** The parts of whisper.cpp's `--output-json` file that Weft uses. */
const WhisperJson = z.object({
  result: z.object({ language: z.string().min(1) }),
  transcription: z.array(
    z.object({
      offsets: z.object({ from: z.number(), to: z.number() }),
      text: z.string(),
    }),
  ),
})

export function parseWhisperJson(json: string): {
  language: string
  segments: TranscriptSegment[]
} {
  const parsed = WhisperJson.parse(JSON.parse(json))
  return {
    language: parsed.result.language,
    segments: parsed.transcription.map((s) => ({
      startMs: s.offsets.from,
      endMs: s.offsets.to,
      text: s.text,
    })),
  }
}
