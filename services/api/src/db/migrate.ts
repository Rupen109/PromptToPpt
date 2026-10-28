import { existsSync } from 'node:fs'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { seedBilling } from '../billing/seed.ts'
import { db, pool } from './index.ts'

// from source (src/db/migrate.ts) the folder is two levels up; from the built image (dist/migrate.js) it sits next to dist/
const folder = [new URL('../drizzle', import.meta.url), new URL('../../drizzle', import.meta.url)].find((u) => existsSync(new URL('meta/_journal.json', u + '/')))
if (!folder) throw new Error('migrations folder not found')
await migrate(db, { migrationsFolder: folder.pathname })
console.log('Migrations applied')
await seedBilling()
console.log('Plan catalogue seeded')
await pool.end()
