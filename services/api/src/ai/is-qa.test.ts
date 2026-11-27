import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { aiKeyFor } from '../env.ts'

/** IS_QA, the one switch between testing (the FREE Gemini key) and the real thing (the PAID key): src/env.ts aiKeyFor */
describe('IS_QA picks the Gemini key and its tier', () => {
  const keys = { GEMINI_API_KEY_QA: 'qa-free', GEMINI_API_KEY_LOCAL: 'local-free', GEMINI_API_KEY_PAID: 'paid', GEMINI_API_KEY: 'plain' }
  const values = (r: ReturnType<typeof aiKeyFor>) => r.GEMINI_KEYS.map((k) => `${k.name}=${k.key}`)
  it('true: the free tier, every free key in the owner\'s order LOCAL → QA → QA2 → QA3 → QA4 (each takes over when the ones before hit the quota)', () => {
    const all = aiKeyFor({ IS_QA: true, ...keys, GEMINI_API_KEY_QA2: 'qa2', GEMINI_API_KEY_QA3: 'qa3', GEMINI_API_KEY_QA4: 'qa4' })
    expect(all.AI_KEY_TIER).toBe('free')
    expect(values(all)).toEqual(['LOCAL=local-free', 'QA=qa-free', 'QA2=qa2', 'QA3=qa3', 'QA4=qa4'])
    expect(all.GEMINI_API_KEY).toBe('local-free') // the first one
    expect(values(aiKeyFor({ IS_QA: true, ...keys, GEMINI_API_KEY_LOCAL: undefined, GEMINI_API_KEY_QA3: 'qa3' }))).toEqual(['QA=qa-free', 'QA3=qa3']) // gaps are skipped
    expect(values(aiKeyFor({ IS_QA: true, GEMINI_API_KEY_LOCAL: 'same', GEMINI_API_KEY_QA: 'same ', GEMINI_API_KEY_QA2: '' }))).toEqual(['LOCAL=same']) // the same key once; empty lines ignored
    expect(values(aiKeyFor({ IS_QA: true, GEMINI_API_KEY: 'plain' }))).toEqual(['GEMINI_API_KEY=plain']) // no free key named: the plain one
  })
  it('false: the paid tier, ONE key: the PAID key, else GEMINI_API_KEY (the live server stores its paid key there); never a free key', () => {
    expect(values(aiKeyFor({ IS_QA: false, ...keys, GEMINI_API_KEY_QA2: 'qa2' }))).toEqual(['PAID=paid'])
    expect(aiKeyFor({ IS_QA: false, GEMINI_API_KEY: 'plain', GEMINI_API_KEY_QA: 'qa-free' })).toMatchObject({ AI_KEY_TIER: 'paid', GEMINI_API_KEY: 'plain' })
    expect(aiKeyFor({ IS_QA: false, GEMINI_API_KEY_QA: 'qa-free' }).GEMINI_KEYS).toEqual([])
  })

  // the start-up checks, run as the app would start (a separate process, so this suite's own settings are not disturbed)
  const start = (over: Record<string, string>) => spawnSync(process.execPath, ['--import', 'tsx', '-e', "import('./src/env.ts').then(()=>process.exit(0))"], {
    cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', DATABASE_URL: 'postgres://x@localhost/x', AUTH_SECRET: 'a'.repeat(40), API_URL: 'http://localhost:4000', WEB_URL: 'http://localhost:3000', EDITOR_URL: 'http://localhost:3001', ...over },
  })
  it('production refuses IS_QA=true; an old AI_KEY_TIER that disagrees with IS_QA stops the start with a clear message', () => {
    const prod = start({ APP_ENV: 'production', IS_QA: 'true' })
    expect(prod.status).toBe(1); expect(prod.stderr).toMatch(/IS_QA=true \(the free Gemini key\) is for testing/)
    const old = start({ IS_QA: 'false', AI_KEY_TIER: 'free' })
    expect(old.status).toBe(1); expect(old.stderr).toMatch(/AI_KEY_TIER is replaced by IS_QA/)
    expect(start({ IS_QA: 'true', AI_KEY_TIER: 'free' }).status).toBe(0) // (an old line that agrees still starts)
    expect(start({ IS_QA: 'true' }).status).toBe(0)
  })
})
