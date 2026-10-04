import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { seedBilling } from '../billing/seed.ts'
import { db, pool } from './index.ts'

await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
console.log('Migrations applied')
await seedBilling()
console.log('Plan catalogue seeded')
await pool.end()
