import { describe, expect, it } from 'vitest'
import {
  avcCodec,
  encodeArgs,
  peakBandwidth,
  posterArgs,
  scaledDimensions,
  scaleFilter,
  spriteArgs,
  tileHeight,
} from './render-plan'

describe('render plan', () => {
  it('scales the short side, landscape or portrait', () => {
    expect(scaleFilter({ width: 1920, height: 1080 }, 720)).toBe('scale=-2:720')
    expect(scaleFilter({ width: 1080, height: 1920 }, 720)).toBe('scale=720:-2')
    expect(scaledDimensions({ width: 1920, height: 1080 }, 720)).toEqual({
      width: 1280,
      height: 720,
    })
    expect(scaledDimensions({ width: 1366, height: 768 }, 720)).toEqual({
      width: 1280,
      height: 720,
    })
    expect(scaledDimensions({ width: 1080, height: 1920 }, 720)).toEqual({
      width: 720,
      height: 1280,
    })
  })

  it('encodes H.264/AAC with fixed keyframes, applying the trim accurately', () => {
    const args = encodeArgs({
      input: 'in.mp4',
      output: 'out.mp4',
      scale: 'scale=-2:720',
      trim: { startMs: 1500, endMs: 9000 },
      faststart: true,
    })
    const joined = args.join(' ')
    // Seeking after -i decodes from the start, so cuts land on the exact frame.
    expect(joined).toContain('-i in.mp4 -ss 1.500 -to 9.000')
    expect(joined).toContain('-map 0:a:0?')
    expect(joined).toContain('-force_key_frames expr:gte(t,n_forced*2)')
    expect(joined).toContain('-movflags +faststart out.mp4')

    const plain = encodeArgs({ input: 'a', output: 'b', scale: 's', trim: null, faststart: false })
    expect(plain).not.toContain('-ss')
    expect(plain).not.toContain('-movflags')
  })

  it('takes the poster a moment in, but within short videos', () => {
    expect(posterArgs('in', 'p.jpg', 60_000)).toContain('1.000')
    expect(posterArgs('in', 'p.jpg', 1200)).toContain('0.600')
  })

  it('lays thumbnails out in a grid', () => {
    const args = spriteArgs({
      input: 'in',
      output: 's.jpg',
      intervalMs: 6000,
      count: 100,
      columns: 10,
      tileWidth: 160,
    })
    expect(args).toContain('fps=1000/6000,scale=160:-2,tile=10x10')
    expect(tileHeight({ width: 1920, height: 1080 }, 160)).toBe(90)
    expect(tileHeight({ width: 1080, height: 1920 }, 160)).toBe(284)
  })

  it('builds RFC 6381 codec strings', () => {
    expect(avcCodec('High', 40)).toBe('avc1.640028')
    expect(avcCodec('Main', 31)).toBe('avc1.4d001f')
    expect(avcCodec('Constrained Baseline', 30)).toBe('avc1.42e01e')
    expect(avcCodec('Unknown', 41)).toBe('avc1.640029')
  })

  it('finds the peak segment bitrate of a playlist', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:4.000000,',
      'seg-00000.m4s',
      '#EXTINF:2.000000,',
      'seg-00001.m4s',
      '#EXTINF:0,',
      'seg-00002.m4s',
      '#EXT-X-ENDLIST',
    ].join('\n')
    const sizes: Record<string, number> = { 'seg-00000.m4s': 1_000_000, 'seg-00001.m4s': 600_000 }
    expect(peakBandwidth(playlist, (uri) => sizes[uri] ?? 0)).toBe(2_400_000)
  })
})
