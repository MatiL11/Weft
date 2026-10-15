import { describe, expect, it } from 'vitest'
import { bubbleRect, containRect, coverCrop, outputSize } from './layout'

describe('outputSize', () => {
  it('keeps sizes within 1080p as even dimensions', () => {
    expect(outputSize({ width: 1280, height: 721 })).toEqual({ width: 1280, height: 720 })
  })

  it('scales larger sources down to 1080p preserving the aspect ratio', () => {
    expect(outputSize({ width: 2560, height: 1440 })).toEqual({ width: 1920, height: 1080 })
    expect(outputSize({ width: 3440, height: 1440 })).toEqual({ width: 2580, height: 1080 })
  })

  it('limits the long side for portrait sources', () => {
    expect(outputSize({ width: 1440, height: 2560 })).toEqual({ width: 1080, height: 1920 })
  })

  it('rejects empty sources', () => {
    expect(() => outputSize({ width: 0, height: 720 })).toThrow(RangeError)
  })
})

describe('bubbleRect', () => {
  const canvas = { width: 1920, height: 1080 }

  it('places a square bubble in the requested corner with a margin', () => {
    // medium = 26% of the short side → 281px; margin = 3% → 32px
    expect(bubbleRect(canvas, { position: 'bottom-left', size: 'medium' })).toEqual({
      x: 32,
      y: 1080 - 32 - 281,
      width: 281,
      height: 281,
    })
    expect(bubbleRect(canvas, { position: 'top-right', size: 'medium' })).toEqual({
      x: 1920 - 32 - 281,
      y: 32,
      width: 281,
      height: 281,
    })
  })

  it('scales with the size option', () => {
    const small = bubbleRect(canvas, { position: 'bottom-right', size: 'small' }).width
    const large = bubbleRect(canvas, { position: 'bottom-right', size: 'large' }).width
    expect(small).toBeLessThan(large)
    expect(bubbleRect(canvas, { position: 'top-left', size: 'large' })).toMatchObject({
      x: 32,
      y: 32,
    })
  })
})

describe('containRect', () => {
  it('letterboxes a wider source inside the target', () => {
    expect(containRect({ width: 2000, height: 500 }, { width: 1000, height: 1000 })).toEqual({
      x: 0,
      y: 375,
      width: 1000,
      height: 250,
    })
  })

  it('pillarboxes a taller source', () => {
    expect(containRect({ width: 500, height: 1000 }, { width: 1000, height: 1000 })).toEqual({
      x: 250,
      y: 0,
      width: 500,
      height: 1000,
    })
  })
})

describe('coverCrop', () => {
  it('crops the centre of a wide source to fill a square', () => {
    expect(coverCrop({ width: 1280, height: 720 }, { width: 100, height: 100 })).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    })
  })

  it('crops the centre of a tall source to fill a wide target', () => {
    expect(coverCrop({ width: 720, height: 1280 }, { width: 1600, height: 900 })).toEqual({
      x: 0,
      y: 437.5,
      width: 720,
      height: 405,
    })
  })
})
