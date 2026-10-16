import { serve } from '@hono/node-server'
import { runMigrations } from '@weft/infra-db'
import { pino } from 'pino'
import { loadConfig } from './config'
import { createContainer } from './container'

const config = loadConfig()
const logger = pino({ level: config.LOG_LEVEL })

if (config.RUN_MIGRATIONS) {
  await runMigrations(config.DATABASE_URL, config.MIGRATIONS_DIR)
  logger.info('database migrations applied')
}

const STORAGE_READY_ATTEMPTS = 30
const STORAGE_RETRY_MS = 1000

const container = await createContainer(config, logger)

// Object storage may still be starting (e.g. in docker compose); retry for a while.
for (let attempt = 1; ; attempt++) {
  try {
    await container.storage.ensureBucket({ corsOrigins: [config.PUBLIC_URL] })
    break
  } catch (error) {
    if (attempt >= STORAGE_READY_ATTEMPTS) throw error
    logger.warn({ attempt, err: error }, 'object storage not ready, retrying')
    await new Promise((resolve) => setTimeout(resolve, STORAGE_RETRY_MS))
  }
}
logger.info({ bucket: config.S3_BUCKET }, 'object storage ready')
const server = serve({ fetch: container.app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port }, 'api listening')
})

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  server.close()
  await container.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
