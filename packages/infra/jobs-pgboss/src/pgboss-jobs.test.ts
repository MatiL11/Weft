import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { RenderJob } from '@weft/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PgBossJobs } from './pgboss-jobs'

const waitFor = async (condition: () => boolean, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe('PgBossJobs (integration)', () => {
  let container: StartedPostgreSqlContainer
  const errors: Error[] = []
  const start = () =>
    PgBossJobs.start({
      connectionString: container.getConnectionUri(),
      onError: (error) => errors.push(error),
      retryDelaySeconds: 1,
    })

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start()
  })

  afterAll(async () => {
    await container?.stop()
  })

  it('delivers render jobs from the API to a worker, retrying failures', async () => {
    // Two instances, like the API and the worker; starting twice is safe.
    const api = await start()
    const worker = await start()
    const received: RenderJob[] = []
    let attempts = 0

    await worker.workRenders(
      async (job) => {
        attempts += 1
        if (job.videoId === 'flaky' && attempts === 1) throw new Error('ffmpeg crashed')
        received.push(job)
      },
      { concurrency: 1, pollingIntervalSeconds: 0.5 },
    )
    await api.enqueue({ videoId: 'flaky', version: 1 })
    await api.enqueue({ videoId: 'vid_2', version: 3 })

    await waitFor(() => received.length === 2)
    expect(received).toEqual(
      expect.arrayContaining([
        { videoId: 'flaky', version: 1 },
        { videoId: 'vid_2', version: 3 },
      ]),
    )
    expect(attempts).toBe(3)
    expect(errors).toEqual([])

    // Transcriptions travel on their own queue.
    const transcriptions: unknown[] = []
    await worker.workTranscriptions(async (job) => void transcriptions.push(job), {
      concurrency: 1,
      pollingIntervalSeconds: 0.5,
    })
    await api.enqueueTranscription({ videoId: 'vid_2', version: 1 })
    await waitFor(() => transcriptions.length === 1)
    expect(transcriptions).toEqual([{ videoId: 'vid_2', version: 1 }])
    expect(received).toHaveLength(2)

    // The trash purge is scheduled daily and can also be triggered.
    let purges = 0
    await worker.workTrashPurge(async () => void (purges += 1), { pollingIntervalSeconds: 0.5 })
    await api.purgeTrashNow()
    await waitFor(() => purges === 1)

    await api.stop()
    await worker.stop()
  })
})
