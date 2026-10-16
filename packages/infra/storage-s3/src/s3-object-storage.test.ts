import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachmentDisposition, S3ObjectStorage } from './s3-object-storage'

const ORIGIN = 'http://localhost:3000'
const CREDENTIALS = { accessKeyId: 'weft-test', secretAccessKey: 'weft-test-secret' }
const IDENTITIES = JSON.stringify({
  identities: [
    {
      name: 'weft',
      credentials: [{ accessKey: CREDENTIALS.accessKeyId, secretKey: CREDENTIALS.secretAccessKey }],
      actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
    },
  ],
})

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('base64')
const sample = (size: number) => new Uint8Array(size).map((_, i) => i % 251)

describe('S3ObjectStorage (integration, SeaweedFS)', () => {
  let container: StartedTestContainer
  let storage: S3ObjectStorage

  beforeAll(async () => {
    container = await new GenericContainer('chrislusf/seaweedfs:4.48')
      .withCommand(['server', '-s3', '-s3.config=/etc/s3.json', '-dir=/data'])
      .withCopyContentToContainer([{ content: IDENTITIES, target: '/etc/s3.json' }])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forListeningPorts())
      .start()
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`
    storage = new S3ObjectStorage({
      endpoint,
      publicEndpoint: endpoint,
      region: 'us-east-1',
      bucket: 'weft',
      ...CREDENTIALS,
    })
    // SeaweedFS starts its S3 gateway a moment after the port opens.
    for (let attempt = 0; ; attempt++) {
      try {
        await storage.ensureBucket({ corsOrigins: [ORIGIN] })
        break
      } catch (error) {
        if (attempt > 30) throw error
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  })

  afterAll(async () => {
    await container?.stop()
  })

  async function put(key: string, body: Uint8Array, declared = body) {
    const { url } = await storage.presignPut(key, {
      byteLength: declared.byteLength,
      sha256: sha256(declared),
      contentType: 'video/iso.segment',
      expiresInSeconds: 60,
    })
    return fetch(url, { method: 'PUT', body, headers: { 'content-type': 'video/iso.segment' } })
  }

  it('accepts an upload whose bytes match the signed checksum, and serves it back', async () => {
    const body = sample(4096)
    expect((await put('videos/a/seg-000000.m4s', body)).status).toBe(200)

    expect(await storage.head('videos/a/seg-000000.m4s')).toEqual({ byteLength: 4096 })
    const url = await storage.presignGet('videos/a/seg-000000.m4s', { expiresInSeconds: 60 })
    expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(body)
  })

  it('rejects an upload whose bytes differ from the signed checksum', async () => {
    const declared = sample(2048)
    const tampered = declared.slice()
    tampered[7] = 0
    const res = await put('videos/b/seg-000000.m4s', tampered, declared)

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await storage.head('videos/b/seg-000000.m4s')).toBeNull()
  })

  it('deletes every object under a prefix, leaving other videos alone', async () => {
    await put('videos/del/init.mp4', sample(100))
    await put('videos/del/seg-000000.m4s', sample(200))
    await put('videos/keep/init.mp4', sample(50))

    await storage.deletePrefix('videos/del/')

    expect(await storage.head('videos/del/init.mp4')).toBeNull()
    expect(await storage.head('videos/del/seg-000000.m4s')).toBeNull()
    expect(await storage.head('videos/keep/init.mp4')).toEqual({ byteLength: 50 })
    await expect(storage.deletePrefix('videos/nothing-here/')).resolves.toBeUndefined()
  })

  it('reports missing objects as null', async () => {
    expect(await storage.head('videos/none/init.mp4')).toBeNull()
  })

  it('allows browser uploads from the configured origin only (CORS)', async () => {
    const { url } = await storage.presignPut('videos/c/init.mp4', {
      byteLength: 10,
      sha256: sha256(sample(10)),
      contentType: 'video/mp4',
      expiresInSeconds: 60,
    })
    const preflight = (origin: string) =>
      fetch(url, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' },
      })

    expect((await preflight(ORIGIN)).headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(
      (await preflight('https://evil.example')).headers.get('access-control-allow-origin'),
    ).toBeNull()
  })

  it('surfaces real failures instead of treating them as "not found"', async () => {
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`
    const misconfigured = new S3ObjectStorage({
      endpoint,
      publicEndpoint: endpoint,
      region: 'us-east-1',
      bucket: 'weft',
      accessKeyId: CREDENTIALS.accessKeyId,
      secretAccessKey: 'wrong-secret',
    })
    await expect(misconfigured.head('videos/a/seg-000000.m4s')).rejects.toThrow()
    await expect(misconfigured.ensureBucket({ corsOrigins: [ORIGIN] })).rejects.toThrow()
    await expect(misconfigured.readText('videos/a/seg-000000.m4s')).rejects.toThrow()
  })

  it('moves files between disk and storage, and reads small text objects', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weft-storage-'))
    try {
      await writeFile(join(dir, 'index.m3u8'), '#EXTM3U\n#EXT-X-ENDLIST\n')
      await storage.uploadFile(
        'videos/r/720p/index.m3u8',
        join(dir, 'index.m3u8'),
        'application/vnd.apple.mpegurl',
      )
      expect(await storage.readText('videos/r/720p/index.m3u8')).toBe('#EXTM3U\n#EXT-X-ENDLIST\n')
      expect(await storage.readText('videos/r/missing.m3u8')).toBeNull()

      await put('videos/r/init.mp4', sample(300))
      await storage.downloadToFile('videos/r/init.mp4', join(dir, 'init.mp4'))
      expect(new Uint8Array(await readFile(join(dir, 'init.mp4')))).toEqual(sample(300))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('signs download links that save under the given name', async () => {
    await put('videos/d/video.mp4', sample(64))
    const url = await storage.presignGet('videos/d/video.mp4', {
      expiresInSeconds: 60,
      downloadFilename: 'Demo de ventas.mp4',
    })
    const res = await fetch(url)
    expect(res.headers.get('content-disposition')).toBe(attachmentDisposition('Demo de ventas.mp4'))
  })

  it('is idempotent when the bucket already exists', async () => {
    await expect(storage.ensureBucket({ corsOrigins: [ORIGIN] })).resolves.toBeUndefined()
  })
})

describe('attachmentDisposition', () => {
  it('keeps the exact UTF-8 name and an ASCII fallback without quotes or slashes', () => {
    expect(attachmentDisposition('Reunión "Q4"/final.mp4')).toBe(
      `attachment; filename="Reuni_n Q4final.mp4"; filename*=UTF-8''Reuni%C3%B3n%20Q4final.mp4`,
    )
    expect(attachmentDisposition('""')).toBe(
      `attachment; filename="download"; filename*=UTF-8''download`,
    )
  })
})
