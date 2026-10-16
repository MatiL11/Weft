import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadVerified, ensureWhisperModel } from './whisper-models'

describe('whisper models', () => {
  let dir: string
  const body = new TextEncoder().encode('fake model weights')
  const sha = createHash('sha256').update(body).digest('hex')
  const serve = (status = 200) =>
    vi.fn(async () => new Response(status === 200 ? body : null, { status }))

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weft-models-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps a download whose checksum matches', async () => {
    await downloadVerified('https://models/x.bin', join(dir, 'x.bin'), sha, serve())
    expect(await readFile(join(dir, 'x.bin'), 'utf8')).toBe('fake model weights')
  })

  it('discards corrupt or failed downloads', async () => {
    await expect(
      downloadVerified('https://m/x.bin', join(dir, 'x.bin'), 'f'.repeat(64), serve()),
    ).rejects.toThrow('corrupt')
    await expect(
      downloadVerified('https://m/x.bin', join(dir, 'x.bin'), sha, serve(404)),
    ).rejects.toThrow('HTTP 404')
    expect(await readdir(dir)).toEqual([])
  })

  it('reuses a model that is already there, and downloads missing ones', async () => {
    await writeFile(join(dir, 'ggml-tiny.bin'), 'cached')
    const fetchImpl = serve()
    expect(await ensureWhisperModel('tiny', dir, fetchImpl)).toBe(join(dir, 'ggml-tiny.bin'))
    expect(fetchImpl).not.toHaveBeenCalled()

    // The fake bytes don't match the real base model, so the download is rejected.
    await expect(ensureWhisperModel('base', join(dir, 'nested'), fetchImpl)).rejects.toThrow(
      'corrupt',
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    )
  })
})
