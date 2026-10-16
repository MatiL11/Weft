import { describe, expect, it } from 'vitest'
import {
  isRenderAsset,
  normalizeTrim,
  playbackSource,
  renditionDirectory,
  renditionShortSides,
  renderPrefix,
  sameTrim,
  trimmedTimeline,
  thumbnailPlan,
  visibleDurationMs,
  type VideoRender,
} from './render'

const render = (trim: VideoRender['trim']): VideoRender => ({
  version: 2,
  trim,
  durationMs: 5000,
  renditions: [],
  sprite: { columns: 10, count: 5, intervalMs: 1000, tileWidth: 160, tileHeight: 90 },
  mp4ByteLength: 1,
})

describe('normalizeTrim', () => {
  it('keeps a valid trim and treats "keep everything" as no trim', () => {
    expect(normalizeTrim({ startMs: 1000, endMs: 5000 }, 6000)).toEqual({
      startMs: 1000,
      endMs: 5000,
    })
    expect(normalizeTrim({ startMs: 0, endMs: 6000 }, 6000)).toBeNull()
    expect(normalizeTrim(null, 6000)).toBeNull()
  })

  it.each([
    { startMs: -1, endMs: 3000 },
    { startMs: 0, endMs: 6001 },
    { startMs: 2000, endMs: 2500 },
    { startMs: 4000, endMs: 3000 },
    { startMs: 0.5, endMs: 3000 },
  ])('rejects %j', (trim) => {
    expect(() => normalizeTrim(trim, 6000)).toThrowError(
      expect.objectContaining({ code: 'video.trim_invalid' }),
    )
  })
})

describe('playbackSource', () => {
  it('plays the render when it matches the current trim', () => {
    const r = render({ startMs: 1000, endMs: 5000 })
    expect(
      playbackSource({ status: 'ready', trim: { startMs: 1000, endMs: 5000 }, render: r }),
    ).toEqual({ kind: 'render', render: r })
  })

  it('falls back to the raw recording, skipping the trimmed parts, until a render matches', () => {
    const trim = { startMs: 2000, endMs: 5000 }
    expect(playbackSource({ status: 'ready', trim, render: render(null) })).toEqual({
      kind: 'raw',
      skip: trim,
    })
    expect(playbackSource({ status: 'ready', trim: null, render: null })).toEqual({
      kind: 'raw',
      skip: null,
    })
    expect(playbackSource({ status: 'recording', trim: null, render: render(null) }).kind).toBe(
      'raw',
    )
  })
})

describe('render helpers', () => {
  it('compares trims by value', () => {
    expect(sameTrim(null, null)).toBe(true)
    expect(sameTrim({ startMs: 1, endMs: 2 }, { startMs: 1, endMs: 2 })).toBe(true)
    expect(sameTrim({ startMs: 1, endMs: 2 }, null)).toBe(false)
  })

  it('reports the visible duration after trimming', () => {
    expect(visibleDurationMs({ durationMs: 9000, trim: null })).toBe(9000)
    expect(visibleDurationMs({ durationMs: 9000, trim: { startMs: 1000, endMs: 4000 } })).toBe(3000)
  })

  it('picks the ladder steps a source can fill', () => {
    expect(renditionShortSides(1080)).toEqual([1080, 720])
    expect(renditionShortSides(900)).toEqual([720])
    expect(renditionShortSides(481)).toEqual([480])
  })

  it('spaces thumbnails at least a second apart, at most 100 of them', () => {
    expect(thumbnailPlan(6500)).toEqual({ intervalMs: 1000, count: 7 })
    expect(thumbnailPlan(600_000)).toEqual({ intervalMs: 6000, count: 100 })
    expect(thumbnailPlan(0)).toEqual({ intervalMs: 1000, count: 1 })
  })

  it('names render files and rejects anything else', () => {
    expect(renderPrefix('abc', 3)).toBe('videos/abc/r3/')
    expect(renditionDirectory({ width: 1920, height: 1080 })).toBe('1080p')
    expect(renditionDirectory({ width: 720, height: 1280 })).toBe('720p')
    for (const ok of [
      'video.mp4',
      'poster.jpg',
      'sprite.jpg',
      '720p/index.m3u8',
      '1080p/init.mp4',
      '720p/seg-00012.m4s',
    ]) {
      expect(isRenderAsset(ok)).toBe(true)
    }
    for (const bad of ['../secret', '720p/../../x.m4s', 'init.mp4', '720p/seg-1.m4s', '']) {
      expect(isRenderAsset(bad)).toBe(false)
    }
  })
})

describe('trimmedTimeline', () => {
  const segments = [
    { index: 0, durationMs: 4000 },
    { index: 1, durationMs: 4000 },
    { index: 2, durationMs: 4000 },
    { index: 3, durationMs: 2000 },
  ]

  it('keeps everything without a trim', () => {
    expect(trimmedTimeline(segments, null)).toEqual({ segments, skip: null })
  })

  it('drops segments outside the trim and rebases the trim on the first kept one', () => {
    expect(trimmedTimeline(segments, { startMs: 5000, endMs: 9000 })).toEqual({
      segments: [segments[1], segments[2]],
      skip: { startMs: 1000, endMs: 5000 },
    })
    // Boundaries: a segment ending exactly at the trim start is dropped.
    expect(trimmedTimeline(segments, { startMs: 4000, endMs: 12_000 }).segments).toEqual([
      segments[1],
      segments[2],
    ])
  })
})
