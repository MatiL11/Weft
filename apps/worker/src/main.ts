import { PurgeTrash, RenderVideo, TranscribeVideo } from '@weft/core'
import {
  connectDatabase,
  DrizzleTranscriptRepository,
  DrizzleVideoRepository,
} from '@weft/infra-db'
import { PgBossJobs } from '@weft/infra-jobs'
import { S3ObjectStorage } from '@weft/infra-storage'
import { pino } from 'pino'
import { loadConfig } from './config'
import { FfmpegMediaRenderer } from './ffmpeg-renderer'
import { ensureWhisperModel } from './whisper-models'
import { WhisperSpeechRecognizer } from './whisper-recognizer'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })
const MODEL_RETRY_MS = 60_000

const database = connectDatabase(config.DATABASE_URL)
const storage = new S3ObjectStorage({
  endpoint: config.S3_ENDPOINT,
  publicEndpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
})
const videos = new DrizzleVideoRepository(database.db)
const jobs = await PgBossJobs.start({
  connectionString: config.DATABASE_URL,
  onError: (error) => logger.error({ err: error }, 'job queue error'),
})

/** Runs a job, logging how it went; errors are rethrown so the queue retries. */
async function logged<T>(name: string, job: object, run: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    const result = await run()
    logger.info({ ...job, result, ms: Date.now() - startedAt }, `${name} finished`)
  } catch (error) {
    logger.error({ ...job, err: error, ms: Date.now() - startedAt }, `${name} failed`)
    throw error
  }
}

const renderVideo = new RenderVideo({
  videos,
  storage,
  transcriptions: jobs,
  renderer: new FfmpegMediaRenderer({
    storage,
    ffmpeg: config.FFMPEG_PATH,
    ffprobe: config.FFPROBE_PATH,
    workDir: config.WORK_DIR,
  }),
})
await jobs.workRenders((job) => logged('render', job, () => renderVideo.execute(job)), {
  concurrency: config.RENDER_CONCURRENCY,
})

const purgeTrash = new PurgeTrash({ videos, storage, clock: { now: () => new Date() } })
await jobs.workTrashPurge(() => logged('trash purge', {}, () => purgeTrash.execute()))

/** The model may need downloading; retry until it is available. */
async function whisperModel(): Promise<string> {
  if (config.WHISPER_MODEL_PATH) return config.WHISPER_MODEL_PATH
  for (;;) {
    try {
      return await ensureWhisperModel(config.WHISPER_MODEL, config.WHISPER_MODELS_DIR)
    } catch (error) {
      logger.error(
        { err: error, model: config.WHISPER_MODEL },
        'whisper model unavailable, retrying',
      )
      await new Promise((resolve) => setTimeout(resolve, MODEL_RETRY_MS))
    }
  }
}

// Transcriptions start once the model is ready, so jobs wait in the queue meanwhile.
void whisperModel().then(async (modelPath) => {
  logger.info({ modelPath }, 'whisper model ready')
  const transcribeVideo = new TranscribeVideo({
    videos,
    transcripts: new DrizzleTranscriptRepository(database.db),
    clock: { now: () => new Date() },
    recognizer: new WhisperSpeechRecognizer({
      storage,
      ffmpeg: config.FFMPEG_PATH,
      ffprobe: config.FFPROBE_PATH,
      whisperCli: config.WHISPER_CLI_PATH,
      modelPath: async () => modelPath,
      threads: config.WHISPER_THREADS,
      workDir: config.WORK_DIR,
    }),
  })
  await jobs.workTranscriptions(
    (job) => logged('transcription', job, () => transcribeVideo.execute(job)),
    { concurrency: config.TRANSCRIBE_CONCURRENCY },
  )
})
logger.info({ concurrency: config.RENDER_CONCURRENCY }, 'worker waiting for jobs')

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  await jobs.stop()
  await database.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
