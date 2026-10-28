/**
 * Tests run on their OWN database (prompttoppt_test) so they never pollute dev data — the dev ledger/owner dashboard
 * stays real. Created on demand and migrated to the latest schema before the suite starts.
 */
import pg from 'pg'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'

export default async function setup() {
  const url = new URL(process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL']!)
  const name = process.env['TEST_DATABASE_URL'] ? url.pathname.slice(1) : 'prompttoppt_test'
  if (!process.env['TEST_DATABASE_URL']) {
    const admin = new pg.Client({ connectionString: process.env['DATABASE_URL'] })
    await admin.connect()
    // A fresh database every run. The usage ledger and payments are append-only, so rows from earlier runs can never be deleted, and tests that measure "a private time window"
    // (admin cost/margin/product) would eventually land on a day an old run already used and fail for no reason. `name` is our own fixed test database, never user input.
    await admin.query(`drop database if exists ${name} with (force)`)
    await admin.query(`create database ${name}`)
    await admin.end()
    url.pathname = `/${name}`
  }
  process.env['DATABASE_URL'] = url.toString() // inherited by the test workers
  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 })
  await migrate(drizzle(pool), { migrationsFolder: new URL('./drizzle', import.meta.url).pathname })
  await pool.end()
}
