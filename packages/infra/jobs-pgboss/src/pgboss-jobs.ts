import type {
  Notification,
  NotificationQueue,
  RenderJob,
  RenderQueue,
  TranscriptionJob,
  TranscriptionQueue,
} from '@weft/core'
import { PgBoss } from 'pg-boss'

export const RENDER_QUEUE = 'video-render'
export const TRANSCRIPTION_QUEUE = 'video-transcribe'
export const TRASH_PURGE_QUEUE = 'trash-purge'
export const NOTIFICATION_QUEUE = 'notification'
/** Every day at 03:00 UTC. */
const TRASH_PURGE_CRON = '0 3 * * *'

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
/** Handled notification jobs are deleted after a minute instead of pg-boss's default week. */
const NOTIFICATION_RETENTION_SECONDS = 60
/** A job that runs longer than this is considered stuck and retried. */
const EXPIRE_SECONDS = 3 * 60 * 60

/** Job queues on PostgreSQL (pg-boss): the API enqueues work, workers process it. */
export class PgBossJobs implements RenderQueue, TranscriptionQueue, NotificationQueue {
  private constructor(private readonly boss: PgBoss) {}

  static async start(input: PgBossJobsOptions): Promise<PgBossJobs> {
    const options = { retryDelaySeconds: 30, ...input }
    const boss = new PgBoss(options.connectionString)
    boss.on('error', options.onError)
    await boss.start()
    for (const queue of [
      RENDER_QUEUE,
      TRANSCRIPTION_QUEUE,
      TRASH_PURGE_QUEUE,
      NOTIFICATION_QUEUE,
    ]) {
      await boss.createQueue(queue, {
        retryLimit: RETRY_LIMIT,
        retryDelay: options.retryDelaySeconds,
        retryBackoff: true,
        expireInSeconds: EXPIRE_SECONDS,
      })
    }
    // Notification jobs can carry invite links: don't keep them once handled.
    await boss.updateQueue(NOTIFICATION_QUEUE, {
      deleteAfterSeconds: NOTIFICATION_RETENTION_SECONDS,
    })
    return new PgBossJobs(boss)
  }

  async enqueue(job: RenderJob): Promise<void> {
    await this.boss.send(RENDER_QUEUE, { videoId: job.videoId, version: job.version })
  }

  async enqueueTranscription(job: TranscriptionJob): Promise<void> {
    await this.boss.send(TRANSCRIPTION_QUEUE, { videoId: job.videoId, version: job.version })
  }

  async notify(
    notification: Notification,
    options?: { dedupeKey: string; dedupeSeconds: number },
  ): Promise<void> {
    await this.boss.send(
      NOTIFICATION_QUEUE,
      notification,
      options ? { singletonKey: options.dedupeKey, singletonSeconds: options.dedupeSeconds } : {},
    )
  }

  /** Sends notification emails; a thrown error schedules a retry. */
  workNotifications(
    handler: (notification: Notification) => Promise<void>,
    options: WorkOptions,
  ): Promise<void> {
    return this.work(NOTIFICATION_QUEUE, handler, options)
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

  /** Runs `handler` once a day (pg-boss makes sure only one worker runs each occurrence). */
  async workTrashPurge(
    handler: () => Promise<void>,
    options: { pollingIntervalSeconds?: number } = {},
  ) {
    await this.boss.schedule(TRASH_PURGE_QUEUE, TRASH_PURGE_CRON, null, { tz: 'UTC' })
    await this.work(TRASH_PURGE_QUEUE, handler, { concurrency: 1, ...options })
  }

  /** Queues a purge right away (e.g. for tests or an admin action). */
  async purgeTrashNow(): Promise<void> {
    await this.boss.send(TRASH_PURGE_QUEUE, {})
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
