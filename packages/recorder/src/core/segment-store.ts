/** Port for local, crash-safe storage of a recording's init segment and media segments. */

export type RecordingStatus = 'recording' | 'complete'

export interface RecordingManifest {
  readonly id: string
  /** ISO-8601 creation time. */
  readonly createdAt: string
  readonly status: RecordingStatus
  readonly mimeType: string
  readonly videoCodec?: string
  readonly audioCodec?: string
  readonly segmentCount: number
  readonly durationMs: number
}

export interface StoredRecording {
  init: Uint8Array
  segments: Uint8Array[]
}

export interface SegmentStore {
  create(manifest: RecordingManifest): Promise<void>
  writeInit(id: string, data: Uint8Array): Promise<void>
  writeSegment(id: string, index: number, data: Uint8Array): Promise<void>
  updateManifest(id: string, patch: Partial<Omit<RecordingManifest, 'id'>>): Promise<void>
  list(): Promise<RecordingManifest[]>
  /** Returns the init segment and all media segments, ordered by index. */
  readAll(id: string): Promise<StoredRecording>
  delete(id: string): Promise<void>
}
