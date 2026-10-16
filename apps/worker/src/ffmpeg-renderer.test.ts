import { copyFile, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FfmpegMediaRenderer, type RenderStorage } from './ffmpeg-renderer'
import { probeMedia } from './probe'
import { runTool, ToolError } from './run-tool'

/** RenderStorage backed by a local directory (keys are relative paths). */
class DirectoryStorage implements RenderStorage {
  readonly uploads = new Map<string, string>()

  constructor(private readonly root: string) {}

  async downloadToFile(key: string, filePath: string) {
    await copyFile(join(this.root, key), filePath)
  }

  async uploadFile(key: string, filePath: string, contentType: string) {
    await mkdir(dirname(join(this.root, key)), { recursive: true })
    await copyFile(filePath, join(this.root, key))
    this.uploads.set(key, contentType)
  }
}

describe('FfmpegMediaRenderer (real ffmpeg)', () => {
  let root: string
  let storage: DirectoryStorage
  let sourceKeys: string[]
  const renderer = () =>
    new FfmpegMediaRenderer({ storage, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', workDir: root })

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'weft-worker-test-'))
    storage = new DirectoryStorage(root)
    // A recording shaped like the browser's: VP9 + Opus fragmented MP4, init + ~4 s segments.
    const rec = join(root, 'videos/v1')
    await mkdir(rec, { recursive: true })
    // prettier-ignore
    await runTool('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '9.5',
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-g', '60',
      '-c:a', 'libopus',
      '-f', 'hls', '-hls_time', '4', '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', join(rec, 'seg-%06d.m4s'),
      join(rec, 'index.m3u8'),
    ])
    const segments = (await readdir(rec)).filter((f) => f.endsWith('.m4s')).sort()
    sourceKeys = ['videos/v1/init.mp4', ...segments.map((f) => `videos/v1/${f}`)]
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('renders a trimmed HLS ladder, a fast-start MP4, a poster and a thumbnail sprite', async () => {
    const output = await renderer().render({
      sourceKeys,
      trim: { startMs: 1000, endMs: 8000 },
      outputPrefix: 'videos/v1/r1/',
    })

    expect(output.durationMs).toBeGreaterThanOrEqual(6900)
    expect(output.durationMs).toBeLessThanOrEqual(7100)
    expect(output.renditions.map((r) => [r.width, r.height])).toEqual([
      [1920, 1080],
      [1280, 720],
    ])
    for (const rendition of output.renditions) {
      expect(rendition.codecs).toMatch(/^avc1\.64[0-9a-f]{4},mp4a\.40\.2$/)
      expect(rendition.bandwidth).toBeGreaterThan(10_000)
    }
    expect(output.sprite).toEqual({
      columns: 10,
      count: 7,
      intervalMs: 1000,
      tileWidth: 160,
      tileHeight: 90,
    })

    const keys = [...storage.uploads.keys()].sort()
    expect(keys).toEqual(
      expect.arrayContaining([
        'videos/v1/r1/video.mp4',
        'videos/v1/r1/poster.jpg',
        'videos/v1/r1/sprite.jpg',
        'videos/v1/r1/1080p/index.m3u8',
        'videos/v1/r1/1080p/init.mp4',
        'videos/v1/r1/1080p/seg-00000.m4s',
        'videos/v1/r1/720p/index.m3u8',
        'videos/v1/r1/720p/seg-00001.m4s',
      ]),
    )
    expect(keys.every((k) => !k.includes('.tmp.'))).toBe(true)
    expect(storage.uploads.get('videos/v1/r1/1080p/index.m3u8')).toBe(
      'application/vnd.apple.mpegurl',
    )
    expect(storage.uploads.get('videos/v1/r1/720p/seg-00000.m4s')).toBe('video/iso.segment')

    const playlist = await readFile(join(root, 'videos/v1/r1/720p/index.m3u8'), 'utf8')
    expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"')
    expect(playlist).toContain('\nseg-00000.m4s\n')
    expect(playlist).toContain('#EXT-X-ENDLIST')

    const mp4 = await probeMedia('ffprobe', join(root, 'videos/v1/r1/video.mp4'))
    expect(mp4).toMatchObject({ width: 1920, height: 1080, hasAudio: true, profile: 'High' })
    const sprite = await probeMedia('ffprobe', join(root, 'videos/v1/r1/sprite.jpg'))
    expect([sprite.width, sprite.height]).toEqual([1600, 90])
  })

  it('renders a small portrait recording without audio as a single rendition', async () => {
    const rec = join(root, 'videos/v2')
    await mkdir(rec, { recursive: true })
    // prettier-ignore
    await runTool('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-t', '3',
      '-c:v', 'libx264', '-g', '60',
      '-f', 'hls', '-hls_time', '4', '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', join(rec, 'seg-%06d.m4s'),
      join(rec, 'index.m3u8'),
    ])
    const output = await renderer().render({
      sourceKeys: ['videos/v2/init.mp4', 'videos/v2/seg-000000.m4s'],
      trim: null,
      outputPrefix: 'videos/v2/r1/',
    })
    expect(output.renditions).toHaveLength(1)
    expect(output.renditions[0]).toMatchObject({ width: 360, height: 640 })
    expect(output.renditions[0]?.codecs).toMatch(/^avc1\.[0-9a-f]{6}$/)
    expect(storage.uploads.has('videos/v2/r1/360p/index.m3u8')).toBe(true)
  })

  it('cleans up its scratch space and reports ffmpeg failures', async () => {
    const before = await readdir(root)
    await expect(
      renderer().render({
        sourceKeys: ['videos/v1/seg-000001.m4s'],
        trim: null,
        outputPrefix: 'videos/v1/broken/',
      }),
    ).rejects.toBeInstanceOf(ToolError)
    expect(await readdir(root)).toEqual(before)
  })

  it('rejects files without video and reports missing tools', async () => {
    const audioOnly = join(root, 'tone.wav')
    // prettier-ignore
    await runTool('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine', '-t', '1', audioOnly])
    await expect(probeMedia('ffprobe', audioOnly)).rejects.toThrow('No video stream')
    await rm(audioOnly)
    await expect(runTool('weft-no-such-tool', [])).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
