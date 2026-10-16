import type { RenderJob, RenderQueue, TranscriptionJob, TranscriptionQueue } from '@weft/core'
import { PgBoss } from 'pg-boss'

export const RENDER_QUEUE = 'video-render'
export const TRANSCRIPTION_QUEUE = 'video-transcribe'

export interface PgBossJobsOptions {
  connectionString: string
  /** Called for background errors (lost connections, maintenance failures). */
  onError: (error: Error) => void
  /** Seconds before the first retry of a failed job; later retries back off. */
  retryDelaySeconds?: number
}

export interface WorkOptions {
  concurrency: number
  pollingIntervalSeconds?: number
}

const RETRY_LIMIT = 2
/** A job that runs longer than this is considered stuck and retried. */
const EXPIRE_SECONDS = 3 * 60 * 60

/** Job queues on PostgreSQL (pg-boss): the API enqueues work, workers process it. */
export class PgBossJobs implements RenderQueue, TranscriptionQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async start(input: PgBossJobsOptions): Promise<PgBossJobs> {
    const options = { retryDelaySeconds: 30, ...input }
    const boss = new PgBoss(options.connectionString)
    boss.on('error', options.onError)
    await boss.start()
    for (const queue of [RENDER_QUEUE, TRANSCRIPTION_QUEUE]) {
      await boss.createQueue(queue, {
        retryLimit: RETRY_LIMIT,
        retryDelay: options.retryDelaySeconds,
        retryBackoff: true,
        expireInSeconds: EXPIRE_SECONDS,
      })
    }
    return new PgBossJobs(boss)
  }

  async enqueue(job: RenderJob): Promise<void> {
    await this.boss.send(RENDER_QUEUE, { videoId: job.videoId, version: job.version })
  }

  async enqueueTranscription(job: TranscriptionJob): Promise<void> {
    await this.boss.send(TRANSCRIPTION_QUEUE, { videoId: job.videoId, version: job.version })
  }

  /** Processes renders; a thrown error schedules a retry. */
  workRenders(handler: (job: RenderJob) => Promise<void>, options: WorkOptions): Promise<void> {
    return this.work(RENDER_QUEUE, handler, options)
  }

  /** Processes transcriptions; a thrown error schedules a retry. */
  workTranscriptions(
    handler: (job: TranscriptionJob) => Promise<void>,
    options: WorkOptions,
  ): Promise<void> {
    return this.work(TRANSCRIPTION_QUEUE, handler, options)
  }

  /** Lets running jobs finish (up to the timeout), then disconnects. */
  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 })
  }

  private async work<T extends object>(
    queue: string,
    handler: (job: T) => Promise<void>,
    { concurrency, ...polling }: WorkOptions,
  ): Promise<void> {
    await this.boss.work<T>(
      queue,
      { batchSize: 1, localConcurrency: concurrency, pollingIntervalSeconds: 2, ...polling },
      async (jobs) => {
        for (const job of jobs) await handler(job.data)
      },
    )
  }
}
