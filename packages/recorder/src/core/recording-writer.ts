import type { MediaSegment } from './fragments'
import type { RecordingManifest, SegmentStore } from './segment-store'

/**
 * Persists a recording through a SegmentStore. Writes are queued and applied strictly in
 * order; the first failure is kept and every later write is skipped, so callers can stop
 * the recording and report it via `flush()`.
 */
export class RecordingWriter {
  private queue: Promise<void> = Promise.resolve()
  private failure: unknown = null
  private segmentCount = 0

  private constructor(
    private readonly store: SegmentStore,
    readonly id: string,
  ) {}

  static async open(store: SegmentStore, manifest: RecordingManifest): Promise<RecordingWriter> {
    await store.create(manifest)
    return new RecordingWriter(store, manifest.id)
  }

  get error(): unknown {
    return this.failure
  }

  writeInit(data: Uint8Array): void {
    this.enqueue(() => this.store.writeInit(this.id, data))
  }

  writeSegment(segment: MediaSegment): void {
    this.enqueue(async () => {
      await this.store.writeSegment(this.id, segment.index, segment.data)
      this.segmentCount += 1
      await this.store.updateManifest(this.id, { segmentCount: this.segmentCount })
    })
  }

  /** Resolves when every queued write is done; rejects with the first storage error. */
  async flush(): Promise<void> {
    await this.queue
    if (this.failure) throw this.failure
  }

  async complete(durationMs: number): Promise<void> {
    await this.flush()
    await this.store.updateManifest(this.id, {
      status: 'complete',
      durationMs,
      segmentCount: this.segmentCount,
    })
  }

  async discard(): Promise<void> {
    await this.queue
    await this.store.delete(this.id)
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(async () => {
      if (this.failure) return
      try {
        await task()
      } catch (error) {
        this.failure = error
      }
    })
  }
}

/** Interrupted recordings (never completed) that still have media, newest first. */
export async function findRecoverable(
  store: SegmentStore,
  options: { activeId?: string } = {},
): Promise<RecordingManifest[]> {
  const manifests = await store.list()
  return manifests
    .filter((m) => m.status === 'recording' && m.segmentCount > 0 && m.id !== options.activeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
