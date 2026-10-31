import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('../../drizzle/', import.meta.url)
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', dir), 'utf8')) as { entries: { idx: number; when: number; tag: string }[] }

describe('migration journal', () => {
  it('every entry is newer than the one before it (drizzle silently skips an older one) and every .sql file is listed', () => {
    for (let i = 1; i < journal.entries.length; i++) expect(journal.entries[i]!.when, `${journal.entries[i]!.tag} must be newer than ${journal.entries[i - 1]!.tag}`).toBeGreaterThan(journal.entries[i - 1]!.when)
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort()
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(files)
  })
})
