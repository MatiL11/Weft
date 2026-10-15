/**
 * Uploads recorded segments while recording continues: hash → presign → PUT → confirm,
 * a few at a time, retrying transient failures with exponential backoff. Bytes are read
 * lazily from local storage so a slow or offline network doesn't hold recordings in memory.
 */

export type UploadKind = 'init' | 'media'

export interface SegmentDescriptor {
  kind: UploadKind
  index: number
  startMs: number
}

export interface UploadItem extends SegmentDescriptor {
  /** Reads the segment bytes (e.g. from OPFS) when it is this item's turn. */
  load(): Promise<Uint8Array>
}

/** Server side of the upload protocol, bound to one video. */
export interface UploadApi {
  prepare(request: SegmentDescriptor & { byteLength: number; sha256: string }): Promise<{
    url: string
  }>
  confirm(segment: { kind: UploadKind; index: number }): Promise<void>
  complete(summary: { durationMs: number; segmentCount: number }): Promise<void>
}

export interface UploadTransport {
  put(url: string, data: Uint8Array, contentType: string): Promise<void>
}

/** A failed request. Errors that are not UploadError (e.g. network TypeErrors) count as retryable. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

export interface UploadSnapshot {
  pending: number
  uploaded: number
  failed: number
  bytesUploaded: number
}

export interface UploadQueueOptions {
  api: UploadApi
  transport: UploadTransport
  sha256: (data: Uint8Array) => Promise<string>
  sleep?: (ms: number) => Promise<void>
  concurrency?: number
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

const CONTENT_TYPES: Record<UploadKind, string> = { init: 'video/mp4', media: 'video/iso.segment' }

const isRetryable = (error: unknown) => !(error instanceof UploadError) || error.retryable

export class UploadQueue {
  private readonly waiting: UploadItem[] = []
  private active = 0
  private snapshot: UploadSnapshot = { pending: 0, uploaded: 0, failed: 0, bytesUploaded: 0 }
  private readonly listeners = new Set<(snapshot: UploadSnapshot) => void>()
  private idleWaiters: (() => void)[] = []
  private finishing = false
  private readonly settings: Required<UploadQueueOptions>

  constructor(options: UploadQueueOptions) {
    this.settings = {
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      concurrency: 2,
      maxAttempts: 6,
      baseDelayMs: 500,
      maxDelayMs: 15_000,
      ...options,
    }
  }

  getSnapshot = (): UploadSnapshot => this.snapshot

  subscribe = (listener: (snapshot: UploadSnapshot) => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  enqueue(item: UploadItem): void {
    if (this.finishing) throw new Error('The upload queue has finished; no more segments accepted.')
    this.waiting.push(item)
    this.update({ pending: this.snapshot.pending + 1 })
    this.pump()
  }

  /** Waits for every upload, then completes the video. Rejects if any segment failed. */
  async finish(summary: { durationMs: number; segmentCount: number }): Promise<void> {
    this.finishing = true
    await this.idle()
    if (this.snapshot.failed > 0) {
      throw new UploadError(`${this.snapshot.failed} segment(s) could not be uploaded.`, false)
    }
    await this.settings.api.complete(summary)
  }

  private pump(): void {
    while (this.active < this.settings.concurrency && this.waiting.length > 0) {
      const item = this.waiting.shift() as UploadItem
      this.active += 1
      void this.process(item).finally(() => {
        this.active -= 1
        this.pump()
        if (this.active === 0 && this.waiting.length === 0) this.flushIdle()
      })
    }
  }

  private async process(item: UploadItem): Promise<void> {
    try {
      const data = await item.load()
      const sha256 = await this.settings.sha256(data)
      await this.uploadWithRetry(item, data, sha256)
      this.update({
        pending: this.snapshot.pending - 1,
        uploaded: this.snapshot.uploaded + 1,
        bytesUploaded: this.snapshot.bytesUploaded + data.byteLength,
      })
    } catch {
      this.update({ pending: this.snapshot.pending - 1, failed: this.snapshot.failed + 1 })
    }
  }

  private async uploadWithRetry(item: UploadItem, data: Uint8Array, sha256: string) {
    const { api, transport, maxAttempts, baseDelayMs, maxDelayMs, sleep } = this.settings
    for (let attempt = 1; ; attempt++) {
      try {
        // A fresh presigned URL per attempt, so an expired one never blocks a retry.
        const { url } = await api.prepare({
          kind: item.kind,
          index: item.index,
          startMs: item.startMs,
          byteLength: data.byteLength,
          sha256,
        })
        await transport.put(url, data, CONTENT_TYPES[item.kind])
        await api.confirm({ kind: item.kind, index: item.index })
        return
      } catch (error) {
        if (!isRetryable(error) || attempt >= maxAttempts) throw error
        await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)))
      }
    }
  }

  private idle(): Promise<void> {
    if (this.active === 0 && this.waiting.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private flushIdle(): void {
    const waiters = this.idleWaiters
    this.idleWaiters = []
    waiters.forEach((resolve) => resolve())
  }

  private update(patch: Partial<UploadSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener(this.snapshot))
  }
}
