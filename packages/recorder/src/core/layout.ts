/** Geometry for compositing the screen and the camera bubble onto the output canvas. */

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Rect extends Size {
  readonly x: number
  readonly y: number
}

export type BubblePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type BubbleSize = 'small' | 'medium' | 'large'

export interface BubbleOptions {
  position: BubblePosition
  size: BubbleSize
}

/** Short side of the output; larger sources are scaled down to this. */
export const MAX_SHORT_SIDE = 1080
const BUBBLE_FRACTION: Record<BubbleSize, number> = { small: 0.18, medium: 0.26, large: 0.36 }
const BUBBLE_MARGIN_FRACTION = 0.03

const toEven = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

/** Encoder-friendly output size: short side ≤ 1080, even dimensions, same aspect ratio. */
export function outputSize(source: Size): Size {
  if (!(source.width > 0 && source.height > 0)) throw new RangeError('Source size must be positive')
  const scale = Math.min(1, MAX_SHORT_SIDE / Math.min(source.width, source.height))
  return { width: toEven(source.width * scale), height: toEven(source.height * scale) }
}

export function bubbleRect(canvas: Size, options: BubbleOptions): Rect {
  const shortSide = Math.min(canvas.width, canvas.height)
  const diameter = Math.round(shortSide * BUBBLE_FRACTION[options.size])
  const margin = Math.round(shortSide * BUBBLE_MARGIN_FRACTION)
  const left = options.position.endsWith('left')
  const top = options.position.startsWith('top')
  return {
    x: left ? margin : canvas.width - margin - diameter,
    y: top ? margin : canvas.height - margin - diameter,
    width: diameter,
    height: diameter,
  }
}

/** Destination rect that fits `source` entirely inside `target`, centred. */
export function containRect(source: Size, target: Size): Rect {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height }
}

/** Source crop (centred) whose aspect ratio matches `target`, for "cover" drawing. */
export function coverCrop(source: Size, target: Size): Rect {
  const targetRatio = target.width / target.height
  const sourceRatio = source.width / source.height
  const width = sourceRatio > targetRatio ? source.height * targetRatio : source.width
  const height = sourceRatio > targetRatio ? source.height : source.width / targetRatio
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height }
}
