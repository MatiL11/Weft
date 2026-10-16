import { describe, expect, it } from 'vitest'
import {
  buildWebVtt,
  isTranscriptLanguage,
  normalizeSegments,
  transcriptText,
  validateTranscriptLanguage,
} from './transcript'

describe('transcripts', () => {
  it('cleans recognizer output', () => {
    expect(
      normalizeSegments(
        [
          { startMs: 4000, endMs: 6500.4, text: '  second   line ' },
          { startMs: -10, endMs: 3000, text: ' First line.' },
          { startMs: 3000, endMs: 4000, text: '[BLANK_AUDIO]' },
          { startMs: 6500, endMs: 8000, text: '(Música)' },
          { startMs: 8000, endMs: 9000, text: '♪ ♪' },
          { startMs: 9000, endMs: 9000, text: 'empty' },
          { startMs: 9500, endMs: 12_000, text: 'past the end' },
          { startMs: 9000, endMs: 9500, text: '   ' },
          { startMs: 9600, endMs: 9700, text: "(laughs) okay, let's start (pause)" },
        ],
        10_000,
      ),
    ).toEqual([
      { startMs: 0, endMs: 3000, text: 'First line.' },
      { startMs: 4000, endMs: 6500, text: 'second line' },
      { startMs: 9500, endMs: 10_000, text: 'past the end' },
      { startMs: 9600, endMs: 9700, text: "(laughs) okay, let's start (pause)" },
    ])
  })

  it('builds escaped WebVTT', () => {
    expect(
      buildWebVtt([
        { startMs: 0, endMs: 2500, text: 'Hola' },
        { startMs: 3_723_004, endMs: 3_725_000, text: 'a --> b <i>&' },
      ]),
    ).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.500\nHola\n\n2\n01:02:03.004 --> 01:02:05.000\na --&gt; b &lt;i&gt;&amp;\n',
    )
    expect(buildWebVtt([])).toBe('WEBVTT\n')
  })

  it('joins the text and validates languages', () => {
    expect(
      transcriptText([
        { startMs: 0, endMs: 1, text: 'a' },
        { startMs: 1, endMs: 2, text: 'b' },
      ]),
    ).toBe('a b')
    expect(isTranscriptLanguage('es')).toBe(true)
    expect(validateTranscriptLanguage('auto')).toBe('auto')
    expect(() => validateTranscriptLanguage('klingon')).toThrowError(
      expect.objectContaining({ code: 'video.language_invalid' }),
    )
  })
})
