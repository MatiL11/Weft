import { createHash } from 'node:crypto'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3ObjectStorage } from './s3-object-storage'

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
  })

  it('is idempotent when the bucket already exists', async () => {
    await expect(storage.ensureBucket({ corsOrigins: [ORIGIN] })).resolves.toBeUndefined()
  })
})
