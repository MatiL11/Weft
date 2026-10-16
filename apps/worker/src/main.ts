import { RenderVideo } from '@weft/core'
import { connectDatabase, DrizzleVideoRepository } from '@weft/infra-db'
import { PgBossJobs } from '@weft/infra-jobs'
import { S3ObjectStorage } from '@weft/infra-storage'
import { pino } from 'pino'
import { loadConfig } from './config'
import { FfmpegMediaRenderer } from './ffmpeg-renderer'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })

const database = connectDatabase(config.DATABASE_URL)
const storage = new S3ObjectStorage({
  endpoint: config.S3_ENDPOINT,
  publicEndpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
})
const renderVideo = new RenderVideo({
  videos: new DrizzleVideoRepository(database.db),
  storage,
  renderer: new FfmpegMediaRenderer({
    storage,
    ffmpeg: config.FFMPEG_PATH,
    ffprobe: config.FFPROBE_PATH,
    workDir: config.WORK_DIR,
  }),
})

const jobs = await PgBossJobs.start({
  connectionString: config.DATABASE_URL,
  onError: (error) => logger.error({ err: error }, 'job queue error'),
})
await jobs.workRenders(
  async (job) => {
    const startedAt = Date.now()
    try {
      const result = await renderVideo.execute(job)
      logger.info({ ...job, result, ms: Date.now() - startedAt }, 'render finished')
    } catch (error) {
      logger.error({ ...job, err: error, ms: Date.now() - startedAt }, 'render failed')
      throw error
    }
  },
  { concurrency: config.RENDER_CONCURRENCY },
)
logger.info({ concurrency: config.RENDER_CONCURRENCY }, 'worker waiting for renders')

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  await jobs.stop()
  await database.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
