import { renderPrefix } from '../domain/render'
import { segmentKey } from '../domain/video'
import type {
  MediaRenderer,
  ObjectStorage,
  RenderJob,
  RenderQueue,
  VideoRepository,
} from '../ports'

/**
 * Requests a new render of the video. If the queue is unreachable the video stays playable
 * from its raw segments and the render is marked failed, so the owner can retry it later.
 */
export async function queueRender(
  deps: { videos: VideoRepository; renders: RenderQueue },
  videoId: string,
): Promise<void> {
  const version = await deps.videos.requestRender(videoId)
  if (version === null) return
  try {
    await deps.renders.enqueue({ videoId, version })
  } catch {
    await deps.videos.saveRender(videoId, version, { state: 'failed' })
  }
}

export interface RenderDeps {
  videos: VideoRepository
  storage: ObjectStorage
  renderer: MediaRenderer
}

export type RenderResult = 'rendered' | 'stale'

/**
 * Background job: renders the recording with its current trim. Jobs for an outdated version
 * (the trim changed again, or the video was deleted) are skipped or their output discarded.
 */
export class RenderVideo {
  constructor(private readonly deps: RenderDeps) {}

  async execute(job: RenderJob): Promise<RenderResult> {
    const { videos, storage, renderer } = this.deps
    const video = await videos.findById(job.videoId)
    if (!video || video.status !== 'ready' || video.renderVersion !== job.version) return 'stale'
    if (!(await videos.saveRender(video.id, job.version, { state: 'processing' }))) return 'stale'

    const segments = (await videos.listSegments(video.id)).filter((s) => s.uploadedAt)
    const media = segments.filter((s) => s.kind === 'media').sort((a, b) => a.index - b.index)
    const sourceKeys = [
      segmentKey(video.id, 'init', 0),
      ...media.map((s) => segmentKey(video.id, 'media', s.index)),
    ]
    const outputPrefix = renderPrefix(video.id, job.version)

    let output
    try {
      output = await renderer.render({ sourceKeys, trim: video.trim, outputPrefix })
    } catch (error) {
      await videos.saveRender(video.id, job.version, { state: 'failed' })
      await storage.deletePrefix(outputPrefix)
      throw error
    }

    const render = { ...output, version: job.version, trim: video.trim }
    if (!(await videos.saveRender(video.id, job.version, { state: 'ready', render }))) {
      await storage.deletePrefix(outputPrefix)
      return 'stale'
    }
    if (video.render && video.render.version !== job.version) {
      await storage.deletePrefix(renderPrefix(video.id, video.render.version))
    }
    return 'rendered'
  }
}
