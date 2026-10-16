import { z } from 'zod'
import { runTool } from './run-tool'

const ProbeOutput = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      profile: z.string().optional(),
      level: z.number().optional(),
    }),
  ),
  format: z.object({ duration: z.coerce.number().optional() }),
})

export interface MediaInfo {
  durationMs: number
  width: number
  height: number
  hasAudio: boolean
  profile: string | null
  level: number | null
}

export async function probeMedia(ffprobe: string, file: string): Promise<MediaInfo> {
  // prettier-ignore
  const json = await runTool(ffprobe, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height,profile,level:format=duration',
    '-of', 'json',
    file,
  ])
  const parsed = ProbeOutput.parse(JSON.parse(json))
  const video = parsed.streams.find((s) => s.codec_type === 'video')
  if (!video?.width || !video.height) throw new Error(`No video stream in ${file}`)
  return {
    durationMs: Math.round((parsed.format.duration ?? 0) * 1000),
    width: video.width,
    height: video.height,
    hasAudio: parsed.streams.some((s) => s.codec_type === 'audio'),
    profile: video.profile ?? null,
    level: video.level ?? null,
  }
}
