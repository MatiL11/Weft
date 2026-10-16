import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Multilingual whisper.cpp models with their published SHA-256 (Hugging Face). */
export const WHISPER_MODELS = {
  tiny: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
  base: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
  small: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  medium: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
} as const

export type WhisperModel = keyof typeof WHISPER_MODELS

const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  )

/** Downloads `url` to `target` only if its SHA-256 matches; nothing is left behind otherwise. */
export async function downloadVerified(
  url: string,
  target: string,
  sha256: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  // Unique, so workers sharing the models volume never write the same file.
  const partial = `${target}.${randomUUID()}.partial`
  try {
    const response = await fetchImpl(url)
    if (!response.ok || !response.body) {
      throw new Error(`Download of ${url} failed with HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    const digest = await sha256Of(partial)
    if (digest !== sha256) throw new Error(`Download of ${url} is corrupt (sha256 ${digest})`)
    await rename(partial, target)
  } finally {
    await rm(partial, { force: true })
  }
}

/** Path of a model in `directory`, downloading and verifying it first if it is missing. */
export async function ensureWhisperModel(
  model: WhisperModel,
  directory: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const target = join(directory, `ggml-${model}.bin`)
  if (await exists(target)) return target
  await mkdir(directory, { recursive: true })
  await downloadVerified(
    `${MODEL_BASE_URL}/ggml-${model}.bin`,
    target,
    WHISPER_MODELS[model],
    fetchImpl,
  )
  return target
}
