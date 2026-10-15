import {
  bubbleRect,
  containRect,
  coverCrop,
  outputSize,
  type BubbleOptions,
  type Size,
} from '../core/layout'

export interface CompositorSources {
  screen?: MediaStreamTrack
  camera?: MediaStreamTrack
}

const CAMERA_ONLY_SIZE: Size = { width: 1280, height: 720 }
const BUBBLE_RING_WIDTH = 4

async function attachTrack(track: MediaStreamTrack): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([track])
  await video.play()
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) =>
      video.addEventListener('resize', () => resolve(), { once: true }),
    )
  }
  return video
}

function videoSize(video: HTMLVideoElement): Size {
  return { width: video.videoWidth, height: video.videoHeight }
}

/**
 * Draws the screen and the camera bubble onto one canvas, which the encoder samples.
 * Screen-only and camera-only modes use the same path for a single encoding pipeline.
 */
export class Compositor {
  readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D

  private constructor(
    private readonly screen: HTMLVideoElement | null,
    private readonly camera: HTMLVideoElement | null,
    private bubble: BubbleOptions,
    size: Size,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = size.width
    this.canvas.height = size.height
    const context = this.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas 2D is not available.')
    this.context = context
  }

  static async create(sources: CompositorSources, bubble: BubbleOptions): Promise<Compositor> {
    if (!sources.screen && !sources.camera) throw new Error('Nothing to record.')
    const [screen, camera] = await Promise.all([
      sources.screen ? attachTrack(sources.screen) : null,
      sources.camera ? attachTrack(sources.camera) : null,
    ])
    const size = screen ? outputSize(videoSize(screen)) : CAMERA_ONLY_SIZE
    return new Compositor(screen, camera, bubble, size)
  }

  get size(): Size {
    return { width: this.canvas.width, height: this.canvas.height }
  }

  setBubble(bubble: BubbleOptions): void {
    this.bubble = bubble
  }

  draw(): void {
    const ctx = this.context
    ctx.fillStyle = '#111014'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    if (this.screen) {
      const dest = containRect(videoSize(this.screen), this.size)
      ctx.drawImage(this.screen, dest.x, dest.y, dest.width, dest.height)
      if (this.camera) this.drawBubble(this.camera)
    } else if (this.camera) {
      const crop = coverCrop(videoSize(this.camera), this.size)
      ctx.drawImage(
        this.camera,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      )
    }
  }

  dispose(): void {
    for (const video of [this.screen, this.camera]) {
      if (!video) continue
      video.pause()
      video.srcObject = null
    }
  }

  private drawBubble(camera: HTMLVideoElement): void {
    const ctx = this.context
    const rect = bubbleRect(this.size, this.bubble)
    const radius = rect.width / 2
    const cx = rect.x + radius
    const cy = rect.y + radius
    const crop = coverCrop(videoSize(camera), rect)

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    // Mirror the camera like a selfie view, which is what people expect to see.
    ctx.translate(cx * 2, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(
      camera,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    )
    ctx.restore()

    ctx.beginPath()
    ctx.arc(cx, cy, radius - BUBBLE_RING_WIDTH / 2, 0, Math.PI * 2)
    ctx.lineWidth = BUBBLE_RING_WIDTH
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.stroke()
  }
}
