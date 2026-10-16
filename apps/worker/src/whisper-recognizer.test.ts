import { chmod, copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runTool } from './run-tool'
import { WhisperSpeechRecognizer } from './whisper-recognizer'

/** Real whisper.cpp, when available (CI builds it; locally set these to run). */
const WHISPER_CLI = process.env.WHISPER_CLI_PATH
const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH
const SAMPLE_WAV = process.env.WHISPER_SAMPLE_WAV

describe('WhisperSpeechRecognizer', () => {
  let root: string
  const storage = {
    downloadToFile: (key: string, filePath: string) => copyFile(join(root, key), filePath),
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'weft-whisper-'))
    // A short video with a tone, standing in for a render's MP4.
    // prettier-ignore
    await runTool('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-shortest', '-c:v', 'libx264', '-c:a', 'aac', join(root, 'tone.mp4'),
    ])
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('extracts 16 kHz audio, runs whisper.cpp and reads its JSON (stub program)', async () => {
    // A stand-in for whisper-cli that records its arguments and writes a result file.
    const stub = join(root, 'whisper-stub.sh')
    await writeFile(
      stub,
      `#!/bin/sh
echo "$@" > "${root}/args.txt"
while [ $# -gt 0 ]; do
  case "$1" in --output-file) out="$2"; shift ;; --file) audio="$2"; shift ;; esac
  shift
done
test -s "$audio" || exit 3
printf '{"result":{"language":"en"},"transcription":[{"offsets":{"from":0,"to":1500},"text":" Hi."}]}' > "$out.json"
`,
    )
    await chmod(stub, 0o755)
    const recognizer = new WhisperSpeechRecognizer({
      storage,
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
      whisperCli: stub,
      modelPath: async () => '/models/ggml-base.bin',
      threads: 2,
      workDir: root,
    })

    const before = await readdir(root)
    await expect(
      recognizer.transcribe({ mediaKey: 'tone.mp4', language: 'auto' }),
    ).resolves.toEqual({
      language: 'en',
      segments: [{ startMs: 0, endMs: 1500, text: ' Hi.' }],
    })
    expect(await readFile(join(root, 'args.txt'), 'utf8')).toMatch(
      /--model \/models\/ggml-base\.bin .*--language auto --threads 2 --max-len 60 --split-on-word/,
    )
    // Scratch files are cleaned up.
    expect((await readdir(root)).filter((f) => !before.includes(f))).toEqual(['args.txt'])
  })

  it('reports videos without sound instead of transcribing them', async () => {
    // prettier-ignore
    await runTool('ffmpeg', [
      '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1',
      '-c:v', 'libx264', join(root, 'silent.mp4'),
    ])
    const recognizer = new WhisperSpeechRecognizer({
      storage,
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
      whisperCli: 'whisper-cli-is-never-called',
      modelPath: async () => 'unused',
      threads: 1,
      workDir: root,
    })
    await expect(
      recognizer.transcribe({ mediaKey: 'silent.mp4', language: 'auto' }),
    ).resolves.toBeNull()
  })

  it('stops tools that run past their time limit', async () => {
    await expect(runTool('sleep', ['5'], { timeoutMs: 100 })).rejects.toMatchObject({
      name: 'ToolError',
    })
  })

  it.skipIf(!WHISPER_CLI || !WHISPER_MODEL || !SAMPLE_WAV)(
    'transcribes real speech with whisper.cpp',
    async () => {
      // prettier-ignore
      await runTool('ffmpeg', [
        '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=11',
        '-i', SAMPLE_WAV as string,
        '-shortest', '-c:v', 'libx264', '-c:a', 'aac', join(root, 'speech.mp4'),
      ])
      const recognizer = new WhisperSpeechRecognizer({
        storage,
        ffmpeg: 'ffmpeg',
        ffprobe: 'ffprobe',
        whisperCli: WHISPER_CLI as string,
        modelPath: async () => WHISPER_MODEL as string,
        threads: 4,
        workDir: root,
      })
      const result = await recognizer.transcribe({ mediaKey: 'speech.mp4', language: 'auto' })
      if (!result) throw new Error('expected speech')
      expect(result.language).toBe('en')
      const text = result.segments
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
      expect(text).toContain('ask not what your country can do for you')
      expect(result.segments.length).toBeGreaterThan(1)
    },
  )
})
