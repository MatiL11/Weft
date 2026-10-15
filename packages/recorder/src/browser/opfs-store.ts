import type { RecordingManifest, SegmentStore, StoredRecording } from '../core/segment-store'

const ROOT_DIRECTORY = 'weft-recordings'
const MANIFEST_FILE = 'manifest.json'
const INIT_FILE = 'init.mp4'
const SEGMENT_PATTERN = /^seg-(\d+)\.m4s$/

const segmentFile = (index: number) => `seg-${String(index).padStart(6, '0')}.m4s`

async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: BlobPart,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(data)
  } finally {
    await writable.close()
  }
}

async function readBytes(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array> {
  const file = await (await dir.getFileHandle(name)).getFile()
  return new Uint8Array(await file.arrayBuffer())
}

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  )
}

/**
 * SegmentStore backed by the Origin Private File System: every segment is on disk as soon
 * as it is produced, so a closed tab or crashed browser does not lose the recording.
 * Layout: weft-recordings/<id>/{manifest.json, init.mp4, seg-000000.m4s, …}
 */
export class OpfsSegmentStore implements SegmentStore {
  private constructor(private readonly root: FileSystemDirectoryHandle) {}

  static async open(): Promise<OpfsSegmentStore> {
    const storageRoot = await navigator.storage.getDirectory()
    // Ask the browser not to evict recordings under storage pressure (best effort).
    await navigator.storage.persist?.().catch(() => false)
    return new OpfsSegmentStore(
      await storageRoot.getDirectoryHandle(ROOT_DIRECTORY, { create: true }),
    )
  }

  async create(manifest: RecordingManifest): Promise<void> {
    const dir = await this.root.getDirectoryHandle(manifest.id, { create: true })
    await writeFile(dir, MANIFEST_FILE, JSON.stringify(manifest))
  }

  async writeInit(id: string, data: Uint8Array): Promise<void> {
    await writeFile(await this.dir(id), INIT_FILE, data as Uint8Array<ArrayBuffer>)
  }

  async writeSegment(id: string, index: number, data: Uint8Array): Promise<void> {
    await writeFile(await this.dir(id), segmentFile(index), data as Uint8Array<ArrayBuffer>)
  }

  async updateManifest(id: string, patch: Partial<Omit<RecordingManifest, 'id'>>): Promise<void> {
    const dir = await this.dir(id)
    const current = await this.readManifest(dir)
    await writeFile(dir, MANIFEST_FILE, JSON.stringify({ ...current, ...patch, id }))
  }

  async list(): Promise<RecordingManifest[]> {
    const manifests: RecordingManifest[] = []
    for await (const handle of this.root.values()) {
      if (handle.kind !== 'directory') continue
      const manifest = await this.readManifest(handle as FileSystemDirectoryHandle).catch(
        () => null,
      )
      if (manifest) manifests.push(manifest)
    }
    return manifests
  }

  async readAll(id: string): Promise<StoredRecording> {
    const dir = await this.dir(id)
    const indexed: { index: number; name: string }[] = []
    for await (const name of dir.keys()) {
      const match = SEGMENT_PATTERN.exec(name)
      if (match) indexed.push({ index: Number(match[1]), name })
    }
    indexed.sort((a, b) => a.index - b.index)
    const [init, ...segments] = await Promise.all([
      readBytes(dir, INIT_FILE),
      ...indexed.map((s) => readBytes(dir, s.name)),
    ])
    return { init: init ?? new Uint8Array(), segments }
  }

  async delete(id: string): Promise<void> {
    await this.root.removeEntry(id, { recursive: true })
  }

  private dir(id: string): Promise<FileSystemDirectoryHandle> {
    return this.root.getDirectoryHandle(id)
  }

  private async readManifest(dir: FileSystemDirectoryHandle): Promise<RecordingManifest> {
    const text = new TextDecoder().decode(await readBytes(dir, MANIFEST_FILE))
    return JSON.parse(text) as RecordingManifest
  }
}
