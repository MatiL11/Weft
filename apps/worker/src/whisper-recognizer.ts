import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SpeechRecognizer, TranscriptLanguage } from '@weft/core'
import { runTool } from './run-tool'
import { parseWhisperJson } from './whisper-output'

export interface WhisperRecognizerOptions {
  storage: { downloadToFile(key: string, filePath: string): Promise<void> }
  ffmpeg: string
  whisperCli: string
  /** Resolves the model file (it may still be downloading when the worker starts). */
  modelPath: () => Promise<string>
  threads: number
  workDir: string
}

/** Caption lines are cut at word boundaries around this many characters. */
const MAX_LINE_CHARACTERS = 60

/** Speech recognition with whisper.cpp, run as a separate program on the video's audio. */
export class WhisperSpeechRecognizer implements SpeechRecognizer {
  constructor(private readonly options: WhisperRecognizerOptions) {}

  async transcribe(input: { mediaKey: string; language: TranscriptLanguage }) {
    const { storage, ffmpeg, whisperCli, threads, workDir } = this.options
    const model = await this.options.modelPath()
    const scratch = await mkdtemp(join(workDir, 'weft-transcribe-'))
    try {
      const video = join(scratch, 'video.mp4')
      const audio = join(scratch, 'audio.wav')
      await storage.downloadToFile(input.mediaKey, video)
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
      ])
      return parseWhisperJson(await readFile(`${output}.json`, 'utf8'))
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  }
}
