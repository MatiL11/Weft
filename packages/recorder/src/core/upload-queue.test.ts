import { describe, expect, it, vi } from 'vitest'
import { UploadError, UploadQueue, type UploadApi, type UploadTransport } from './upload-queue'

const bytes = (size: number) => new Uint8Array(size).fill(1)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

function setup(overrides: { api?: Partial<UploadApi>; transport?: Partial<UploadTransport> } = {}) {
  const calls: string[] = []
  const api: UploadApi = {
    prepare: vi.fn(async (req) => {
      calls.push(`prepare ${req.kind}${req.index}`)
      return { url: `put://${req.kind}/${req.index}/${calls.length}` }
    }),
    confirm: vi.fn(async (req) => void calls.push(`confirm ${req.kind}${req.index}`)),
    complete: vi.fn(async () => void calls.push('complete')),
    ...overrides.api,
  }
  const transport: UploadTransport = {
    put: vi.fn(async (url: string) => void calls.push(`put ${url}`)),
    ...overrides.transport,
  }
  const sleep = vi.fn(async (_ms: number) => {})
  const queue = new UploadQueue({
    api,
    transport,
    sha256: async () => 'hash',
    sleep,
    concurrency: 2,
    maxAttempts: 3,
    baseDelayMs: 500,
  })
  return { queue, api, transport, sleep, calls }
}

const item = (kind: 'init' | 'media', index: number, size = 10) => ({
  kind,
  index,
  startMs: index * 4000,
  load: vi.fn(async () => bytes(size)),
})

describe('UploadQueue', () => {
  it('prepares, uploads and confirms each segment, then completes', async () => {
    const { queue, api, calls } = setup()
    queue.enqueue(item('init', 0))
    queue.enqueue(item('media', 0, 20))
    await queue.finish({ durationMs: 3500, segmentCount: 1 })

    expect(calls).toEqual([
      'prepare init0',
      'prepare media0',
      'put put://init/0/1',
      'put put://media/0/2',
      'confirm init0',
      'confirm media0',
      'complete',
    ])
    expect(api.prepare).toHaveBeenCalledWith({
      kind: 'media',
      index: 0,
      startMs: 0,
      byteLength: 20,
      sha256: 'hash',
    })
    expect(api.complete).toHaveBeenCalledWith({ durationMs: 3500, segmentCount: 1 })
    expect(queue.getSnapshot()).toEqual({ pending: 0, uploaded: 2, failed: 0, bytesUploaded: 30 })
  })

  it('uploads with the right content type per kind', async () => {
    const { queue, transport } = setup()
    queue.enqueue(item('init', 0))
    queue.enqueue(item('media', 0))
    await queue.finish({ durationMs: 1, segmentCount: 1 })
    expect(transport.put).toHaveBeenCalledWith(expect.any(String), bytes(10), 'video/mp4')
    expect(transport.put).toHaveBeenCalledWith(expect.any(String), bytes(10), 'video/iso.segment')
  })

  it('never runs more uploads at once than the concurrency limit', async () => {
    const gates = [deferred(), deferred(), deferred()]
    let inFlight = 0
    let maxInFlight = 0
    let n = 0
    const { queue } = setup({
      transport: {
        put: async () => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await gates[n++]?.promise
          inFlight--
        },
      },
    })
    ;[0, 1, 2].forEach((i) => queue.enqueue(item('media', i)))
    await new Promise((r) => setTimeout(r, 0))
    expect(maxInFlight).toBe(2)
    gates.forEach((g) => g.resolve())
    await queue.finish({ durationMs: 1, segmentCount: 3 })
    expect(maxInFlight).toBe(2)
  })

  it('does not read waiting segments into memory while earlier uploads are in flight', async () => {
    const gate = deferred()
    const { queue } = setup({ transport: { put: () => gate.promise } })
    queue.enqueue(item('media', 0))
    queue.enqueue(item('media', 1))
    const waiting = item('media', 2)
    queue.enqueue(waiting)
    await new Promise((r) => setTimeout(r, 0))
    expect(waiting.load).not.toHaveBeenCalled()

    gate.resolve()
    await queue.finish({ durationMs: 1, segmentCount: 3 })
    expect(waiting.load).toHaveBeenCalledOnce()
  })

  it('retries transient failures with exponential backoff and a fresh URL', async () => {
    let attempts = 0
    const { queue, api, sleep } = setup({
      transport: {
        put: async () => {
          attempts++
          if (attempts < 3) throw new TypeError('network down')
        },
      },
    })
    queue.enqueue(item('media', 0))
    await queue.finish({ durationMs: 1, segmentCount: 1 })

    expect(attempts).toBe(3)
    expect(api.prepare).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000])
    expect(queue.getSnapshot()).toMatchObject({ uploaded: 1, failed: 0 })
  })

  it('gives up after the last attempt and refuses to complete', async () => {
    const { queue, api } = setup({
      transport: { put: async () => Promise.reject(new UploadError('server error', true, 503)) },
    })
    queue.enqueue(item('media', 0))
    await expect(queue.finish({ durationMs: 1, segmentCount: 1 })).rejects.toThrow(
      /1 segment\(s\) could not be uploaded/,
    )
    expect(api.complete).not.toHaveBeenCalled()
    expect(queue.getSnapshot()).toMatchObject({ uploaded: 0, failed: 1 })
  })

  it('does not retry permanent errors', async () => {
    const { queue, api, sleep } = setup({
      api: { prepare: async () => Promise.reject(new UploadError('forbidden', false, 403)) },
    })
    queue.enqueue(item('media', 0))
    await expect(queue.finish({ durationMs: 1, segmentCount: 1 })).rejects.toThrow()
    expect(sleep).not.toHaveBeenCalled()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('notifies subscribers of progress', async () => {
    const { queue } = setup()
    const seen: number[] = []
    queue.subscribe((s) => seen.push(s.uploaded))
    queue.enqueue(item('media', 0))
    queue.enqueue(item('media', 1))
    await queue.finish({ durationMs: 1, segmentCount: 2 })
    expect(seen.at(-1)).toBe(2)
  })

  it('rejects new items after finishing started', async () => {
    const { queue } = setup()
    const finishing = queue.finish({ durationMs: 1, segmentCount: 0 }).catch(() => undefined)
    expect(() => queue.enqueue(item('media', 0))).toThrow(/finished/)
    await finishing
  })

  it('cancels waiting uploads and refuses new ones', async () => {
    const gate = deferred()
    const { queue, transport } = setup({ transport: { put: vi.fn(() => gate.promise) } })
    ;[0, 1, 2, 3].forEach((i) => queue.enqueue(item('media', i)))
    await new Promise((r) => setTimeout(r, 0))

    queue.cancel()
    expect(queue.getSnapshot().pending).toBe(2)
    expect(() => queue.enqueue(item('media', 9))).toThrow(/finished/)
    gate.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(transport.put).toHaveBeenCalledTimes(2)
  })
})
