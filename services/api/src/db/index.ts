import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.ts'
import * as schema from './schema.ts'

// Our `timestamp` columns hold UTC. Without this, node-postgres serialises a JS Date in the SERVER's local zone, so raw-SQL date ranges (owner analytics) shift by the UTC offset on any non-UTC machine.
pg.defaults.parseInputDatesAsUTC = true

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10, options: '-c timezone=UTC' }) // `now()` defaults on timestamp-without-zone columns must be UTC whatever zone the database server runs in
export const db = drizzle(pool, { schema })
export type Db = typeof db
