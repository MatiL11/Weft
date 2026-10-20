import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  renditionDirectory,
  renditionShortSides,
  THUMBNAIL_COLUMNS,
  THUMBNAIL_WIDTH,
  thumbnailPlan,
  type MediaRenderer,
  type RenderOutput,
  type Rendition,
  type TrimRange,
} from '@weft/core'
import { probeMedia, type MediaInfo } from './probe'
import {
  AAC_CODEC,
  avcCodec,
  encodeArgs,
  hlsPackageArgs,
  peakBandwidth,
  posterArgs,
  scaleFilter,
  spriteArgs,
  tileHeight,
  toolTimeoutMs,
} from './render-plan'
import { runTool } from './run-tool'

/** The storage operations the renderer needs (S3ObjectStorage provides them). */
export interface RenderStorage {
  downloadToFile(key: string, filePath: string): Promise<void>
  uploadFile(key: string, filePath: string, contentType: string): Promise<void>
}

export interface FfmpegRendererOptions {
  storage: RenderStorage
  ffmpeg: string
  ffprobe: string
  workDir: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
}
const UPLOAD_CONCURRENCY = 4
/** Recordings and renders are MP4; never let ffprobe guess another format. */
const MP4 = { format: 'mov' }

const contentType = (file: string) =>
  CONTENT_TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream'

/** Renders recordings with ffmpeg in a scratch directory, then uploads the results. */
export class FfmpegMediaRenderer implements MediaRenderer {
  constructor(private readonly options: FfmpegRendererOptions) {}

  async render(input: {
    sourceKeys: string[]
    trim: TrimRange | null
    outputPrefix: string
  }): Promise<RenderOutput> {
    const scratch = await mkdtemp(join(this.options.workDir, 'weft-render-'))
    try {
      const out = join(scratch, 'out')
      await mkdir(out)
      const source = await this.assembleSource(input.sourceKeys, scratch)
      const output = await this.renderFiles(source, input.trim, out)
      await this.uploadDirectory(out, input.outputPrefix)
      return output
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }

  /** Downloads the init and media segments and joins them into one fragmented MP4. */
  private async assembleSource(keys: string[], scratch: string): Promise<string> {
    const source = join(scratch, 'source.mp4')
    const part = join(scratch, 'part')
    const writer = createWriteStream(source)
    try {
      for (const key of keys) {
        await this.options.storage.downloadToFile(key, part)
        await pipeline(createReadStream(part), writer, { end: false })
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        writer.end((error?: Error | null) => (error ? reject(error) : resolve())),
      )
    }
    return source
  }

  private async renderFiles(source: string, trim: TrimRange | null, out: string) {
    const { ffmpeg, ffprobe } = this.options
    const sourceInfo = await probeMedia(ffprobe, source, MP4)
    const timeout = { timeoutMs: toolTimeoutMs(sourceInfo.durationMs) }
    const [topSide, ...lowerSides] = renditionShortSides(
      Math.min(sourceInfo.width, sourceInfo.height),
    ) as [number, ...number[]]

    // The best rendition doubles as the downloadable MP4.
    const mp4 = join(out, 'video.mp4')
    await runTool(
      ffmpeg,
      encodeArgs({
        input: source,
        output: mp4,
        scale: scaleFilter(sourceInfo, topSide),
        trim,
        faststart: true,
      }),
      timeout,
    )
    const mp4Info = await probeMedia(ffprobe, mp4, MP4)

    const renditions = [await this.packageRendition(mp4, mp4Info, out, timeout)]
    for (const side of lowerSides) {
      const encoded = join(out, `${side}.tmp.mp4`)
      await runTool(
        ffmpeg,
        encodeArgs({
          input: mp4,
          output: encoded,
          scale: scaleFilter(mp4Info, side),
          trim: null,
          faststart: false,
        }),
        timeout,
      )
      const encodedInfo = await probeMedia(ffprobe, encoded, MP4)
      renditions.push(await this.packageRendition(encoded, encodedInfo, out, timeout))
      await rm(encoded)
    }

    await runTool(ffmpeg, posterArgs(mp4, join(out, 'poster.jpg'), mp4Info.durationMs), timeout)
    const plan = thumbnailPlan(mp4Info.durationMs)
    await runTool(
      ffmpeg,
      spriteArgs({
        input: mp4,
        output: join(out, 'sprite.jpg'),
        ...plan,
        columns: THUMBNAIL_COLUMNS,
        tileWidth: THUMBNAIL_WIDTH,
      }),
      timeout,
    )

    return {
      durationMs: mp4Info.durationMs,
      renditions,
      sprite: {
        ...plan,
        columns: THUMBNAIL_COLUMNS,
        tileWidth: THUMBNAIL_WIDTH,
        tileHeight: tileHeight(mp4Info, THUMBNAIL_WIDTH),
      },
      mp4ByteLength: (await stat(mp4)).size,
      hasAudio: mp4Info.hasAudio,
    }
  }

  /** Splits an encoded MP4 into HLS segments and describes it for the master playlist. */
  private async packageRendition(
    file: string,
    info: MediaInfo,
    out: string,
    timeout: { timeoutMs: number },
  ): Promise<Rendition> {
    const directory = join(out, renditionDirectory(info))
    await mkdir(directory)
    await runTool(this.options.ffmpeg, hlsPackageArgs(file, directory), timeout)

    const playlist = await readFile(join(directory, 'index.m3u8'), 'utf8')
    const sizes = new Map<string, number>()
    for (const name of await readdir(directory)) {
      sizes.set(name, (await stat(join(directory, name))).size)
    }
    const video = avcCodec(info.profile ?? 'High', info.level ?? 40)
    return {
      width: info.width,
      height: info.height,
      bandwidth: peakBandwidth(playlist, (uri) => sizes.get(uri) ?? 0),
      codecs: info.hasAudio ? `${video},${AAC_CODEC}` : video,
    }
  }

  private async uploadDirectory(directory: string, prefix: string): Promise<void> {
    const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
    const queue = [...files]
    const uploadNext = async (): Promise<void> => {
      const file = queue.shift()
      if (!file) return
      const key = `${prefix}${relative(directory, file).split('\\').join('/')}`
      await this.options.storage.uploadFile(key, file, contentType(file))
      await uploadNext()
    }
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, uploadNext))
  }
}
