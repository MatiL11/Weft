import type { RecordingManifest, SegmentStore, StoredRecording } from './segment-store'

interface Entry {
  manifest: RecordingManifest
  init: Uint8Array | null
  segments: Map<number, Uint8Array>
  log: (number | 'init')[]
}

export interface InMemorySegmentStoreOptions {
  /** Artificial delay per segment write, to exercise ordering. */
  writeDelayMs?: (index: number) => number
  /** Segment index whose write fails with a quota error. */
  failOnSegment?: number
}

/** In-memory SegmentStore for tests and environments without OPFS. */
export class InMemorySegmentStore implements SegmentStore {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly options: InMemorySegmentStoreOptions = {}) {}

  async create(manifest: RecordingManifest): Promise<void> {
    this.entries.set(manifest.id, { manifest, init: null, segments: new Map(), log: [] })
  }

  async writeInit(id: string, data: Uint8Array): Promise<void> {
    const entry = this.get(id)
    entry.init = data
    entry.log.push('init')
  }

  async writeSegment(id: string, index: number, data: Uint8Array): Promise<void> {
    const delay = this.options.writeDelayMs?.(index) ?? 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    if (this.options.failOnSegment === index) throw new Error('Storage quota exceeded')
    const entry = this.get(id)
    entry.segments.set(index, data)
    entry.log.push(index)
  }

  async updateManifest(id: string, patch: Partial<Omit<RecordingManifest, 'id'>>): Promise<void> {
    const entry = this.get(id)
    entry.manifest = { ...entry.manifest, ...patch }
  }

  async list(): Promise<RecordingManifest[]> {
    return [...this.entries.values()].map((e) => e.manifest)
  }

  async readAll(id: string): Promise<StoredRecording> {
    const entry = this.get(id)
    const segments = [...entry.segments.entries()].sort(([a], [b]) => a - b).map(([, d]) => d)
    return { init: entry.init ?? new Uint8Array(), segments }
  }

  async readSegment(id: string, kind: 'init' | 'media', index: number): Promise<Uint8Array> {
    const entry = this.get(id)
    const data = kind === 'init' ? entry.init : entry.segments.get(index)
    if (!data) throw new Error(`Segment not stored: ${id} ${kind} ${index}`)
    return data
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id)
  }

  /** Order in which writes completed, for assertions. */
  writeLog(id: string): (number | 'init')[] {
    return [...this.get(id).log]
  }

  private get(id: string): Entry {
    const entry = this.entries.get(id)
    if (!entry) throw new Error(`Unknown recording: ${id}`)
    return entry
  }
}
