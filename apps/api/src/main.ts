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

const container = createContainer(config, logger)
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
