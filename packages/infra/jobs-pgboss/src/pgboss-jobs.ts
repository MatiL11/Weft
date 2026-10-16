import type { RenderJob, RenderQueue } from '@weft/core'
import { PgBoss } from 'pg-boss'

export const RENDER_QUEUE = 'video-render'

export interface PgBossJobsOptions {
  connectionString: string
  /** Called for background errors (lost connections, maintenance failures). */
  onError: (error: Error) => void
  /** Seconds before the first retry of a failed render; later retries back off. */
  retryDelaySeconds?: number
}

const RENDER_RETRY_LIMIT = 2
/** A render that runs longer than this is considered stuck and retried. */
const RENDER_EXPIRE_SECONDS = 3 * 60 * 60

/** Job queue on PostgreSQL (pg-boss): the API enqueues renders, workers process them. */
export class PgBossJobs implements RenderQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async start(input: PgBossJobsOptions): Promise<PgBossJobs> {
    const options = { retryDelaySeconds: 30, ...input }
    const boss = new PgBoss(options.connectionString)
    boss.on('error', options.onError)
    await boss.start()
    await boss.createQueue(RENDER_QUEUE, {
      retryLimit: RENDER_RETRY_LIMIT,
      retryDelay: options.retryDelaySeconds,
      retryBackoff: true,
      expireInSeconds: RENDER_EXPIRE_SECONDS,
    })
    return new PgBossJobs(boss)
  }

  async enqueue(job: RenderJob): Promise<void> {
    await this.boss.send(RENDER_QUEUE, { videoId: job.videoId, version: job.version })
  }

  /** Processes renders one at a time per slot; a thrown error schedules a retry. */
  async workRenders(
    handler: (job: RenderJob) => Promise<void>,
    { concurrency, ...polling }: { concurrency: number; pollingIntervalSeconds?: number },
  ): Promise<void> {
    await this.boss.work<RenderJob>(
      RENDER_QUEUE,
      { batchSize: 1, localConcurrency: concurrency, pollingIntervalSeconds: 2, ...polling },
      async (jobs) => {
        for (const job of jobs) await handler(job.data)
      },
    )
  }

  /** Lets running jobs finish (up to the timeout), then disconnects. */
  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 })
  }
}
