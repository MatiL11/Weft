import { describe, expect, it } from 'vitest'
import { buildMediaPlaylist, playableSegments } from './playlist'

const seg = (index: number, startMs: number) => ({ index, startMs })

describe('playableSegments', () => {
  it('while recording, only lists segments whose successor arrived (known duration)', () => {
    const result = playableSegments([seg(0, 0), seg(1, 4000), seg(2, 8100)], { endedAtMs: null })
    expect(result).toEqual([
      { index: 0, durationMs: 4000 },
      { index: 1, durationMs: 4100 },
    ])
  })

  it('once ended, includes the last segment up to the total duration', () => {
    const result = playableSegments([seg(0, 0), seg(1, 4000)], { endedAtMs: 6500 })
    expect(result).toEqual([
      { index: 0, durationMs: 4000 },
      { index: 1, durationMs: 2500 },
    ])
  })

  it('stops at the first gap so players never skip missing media', () => {
    const result = playableSegments([seg(0, 0), seg(1, 4000), seg(3, 12000), seg(4, 16000)], {
      endedAtMs: 18000,
    })
    expect(result.map((s) => s.index)).toEqual([0])
  })

  it('sorts unordered input', () => {
    const result = playableSegments([seg(1, 4000), seg(0, 0)], { endedAtMs: 5000 })
    expect(result.map((s) => s.index)).toEqual([0, 1])
  })

  it('returns nothing without the first segment', () => {
    expect(playableSegments([seg(1, 4000)], { endedAtMs: 9000 })).toEqual([])
  })
})

describe('buildMediaPlaylist', () => {
  const uri = (index: number) => `seg/${index}`

  it('renders a live fMP4 HLS event playlist', () => {
    const text = buildMediaPlaylist({
      initUri: 'init',
      segmentUri: uri,
      segments: [
        { index: 0, durationMs: 4000 },
        { index: 1, durationMs: 4100 },
      ],
      ended: false,
    })
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-TARGETDURATION:5',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:EVENT',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-MAP:URI="init"',
        '#EXTINF:4.000,',
        'seg/0',
        '#EXTINF:4.100,',
        'seg/1',
        '',
      ].join('\n'),
    )
  })

  it('closes the playlist once the recording ended', () => {
    const text = buildMediaPlaylist({
      initUri: 'init',
      segmentUri: uri,
      segments: [{ index: 0, durationMs: 2500 }],
      ended: true,
    })
    expect(text).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
    expect(text.trimEnd().endsWith('#EXT-X-ENDLIST')).toBe(true)
    expect(text).toContain('#EXT-X-TARGETDURATION:3')
  })

  it('uses a sensible target duration for an empty live playlist', () => {
    const text = buildMediaPlaylist({ initUri: 'i', segmentUri: uri, segments: [], ended: false })
    expect(text).toContain('#EXT-X-TARGETDURATION:4')
  })
})
