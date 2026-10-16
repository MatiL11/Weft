import { describe, expect, it } from 'vitest'
import { parseWhisperJson } from './whisper-output'

describe('parseWhisperJson', () => {
  it('reads the detected language and timed segments', () => {
    const json = JSON.stringify({
      systeminfo: 'AVX2 = 1',
      result: { language: 'es' },
      transcription: [
        { timestamps: {}, offsets: { from: 0, to: 2780 }, text: ' Hola.' },
        { offsets: { from: 2780, to: 5000 }, text: ' Adiós.' },
      ],
    })
    expect(parseWhisperJson(json)).toEqual({
      language: 'es',
      segments: [
        { startMs: 0, endMs: 2780, text: ' Hola.' },
        { startMs: 2780, endMs: 5000, text: ' Adiós.' },
      ],
    })
  })

  it('rejects output it does not understand', () => {
    expect(() => parseWhisperJson('{"transcription": []}')).toThrow()
    expect(() => parseWhisperJson('not json')).toThrow()
  })
})
