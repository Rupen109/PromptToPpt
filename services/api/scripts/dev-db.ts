/**
 * Zero-Docker local Postgres. Starts a real PostgreSQL server (embedded-postgres)
 * on localhost:5432 using the same credentials as docker-compose.yml, so
 * DATABASE_URL is identical either way. Data lives in services/api/.local/pg.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const dataDir = resolve(import.meta.dirname, '../.local/pg')
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'prompttoppt',
  password: 'prompttoppt_dev_password',
  port: 5432,
  persistent: true,
})

if (!existsSync(resolve(dataDir, 'PG_VERSION'))) await pg.initialise()
await pg.start()
try {
  await pg.createDatabase('prompttoppt_dev')
} catch {
  /* already exists */
}
console.log('Postgres ready: postgresql://prompttoppt:prompttoppt_dev_password@localhost:5432/prompttoppt_dev')

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
