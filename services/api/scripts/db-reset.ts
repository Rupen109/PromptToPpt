/** Drop + recreate the LOCAL dev database and migrate. Refuses anything that isn't a *_dev database in development. */
import pg from 'pg'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { seedBilling } from '../src/billing/seed.ts'

const url = new URL(process.env['DATABASE_URL'] ?? '')
const name = url.pathname.slice(1)
if (process.env['APP_ENV'] && process.env['APP_ENV'] !== 'development') throw new Error('db:reset only runs when APP_ENV=development')
if (!name.endsWith('_dev') || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`Refusing to reset "${name}" on ${url.hostname}: only a local *_dev database can be reset`)

const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() })
await admin.connect()
await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [name])
await admin.query(`drop database if exists ${name}`)
await admin.query(`create database ${name}`)
await admin.end()

const pool = new pg.Pool({ connectionString: url.toString(), max: 1 })
await migrate(drizzle(pool), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
await pool.end()
await import('../src/db/index.ts').then(async (m) => {
  await seedBilling()
  await m.pool.end()
})
console.log(`✅ ${name} reset, migrated and seeded`)
