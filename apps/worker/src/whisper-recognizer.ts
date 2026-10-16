import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpeechRecognizer, TranscriptLanguage } from '@weft/core'
import { probeMedia } from './probe'
import { runTool } from './run-tool'
import { parseWhisperJson } from './whisper-output'

export interface WhisperRecognizerOptions {
  storage: { downloadToFile(key: string, filePath: string): Promise<void> }
  ffmpeg: string
  ffprobe: string
  whisperCli: string
  /** Resolves the model file (it may still be downloading when the worker starts). */
  modelPath: () => Promise<string>
  threads: number
  workDir: string
}

/** Caption lines are cut at word boundaries around this many characters. */
const MAX_LINE_CHARACTERS = 60
/** Whisper may take at most this long per minute of audio (plus a minute) before it's stopped. */
const TIMEOUT_PER_AUDIO_MINUTE_MS = 2 * 60 * 1000

/** Speech recognition with whisper.cpp, run as a separate program on the video's audio. */
export class WhisperSpeechRecognizer implements SpeechRecognizer {
  constructor(private readonly options: WhisperRecognizerOptions) {}

  async transcribe(input: { mediaKey: string; language: TranscriptLanguage }) {
    const { storage, ffmpeg, ffprobe, whisperCli, threads, workDir } = this.options
    const model = await this.options.modelPath()
    const scratch = await mkdtemp(join(workDir, 'weft-transcribe-'))
    try {
      const video = join(scratch, 'video.mp4')
      const audio = join(scratch, 'audio.wav')
      await storage.downloadToFile(input.mediaKey, video)
      const info = await probeMedia(ffprobe, video)
      if (!info.hasAudio) return null
      const timeoutMs = (Math.ceil(info.durationMs / 60_000) + 1) * TIMEOUT_PER_AUDIO_MINUTE_MS
      // whisper.cpp reads 16 kHz mono PCM.
      // prettier-ignore
      await runTool(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', video,
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
        audio,
      ])
      const output = join(scratch, 'transcript')
      // prettier-ignore
      await runTool(whisperCli, [
        '--model', model,
        '--file', audio,
        '--language', input.language,
        '--threads', String(threads),
        '--max-len', String(MAX_LINE_CHARACTERS),
        '--split-on-word',
        '--output-json',
        '--output-file', output,
        '--no-prints',
      ], { timeoutMs })
      return parseWhisperJson(await readFile(`${output}.json`, 'utf8'))
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }
}
