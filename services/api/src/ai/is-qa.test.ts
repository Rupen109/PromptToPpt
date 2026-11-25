import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { aiKeyFor } from '../env.ts'

/** IS_QA, the one switch between testing (the FREE Gemini key) and the real thing (the PAID key): src/env.ts aiKeyFor */
describe('IS_QA picks the Gemini key and its tier', () => {
  const keys = { GEMINI_API_KEY_QA: 'qa-free', GEMINI_API_KEY_LOCAL: 'local-free', GEMINI_API_KEY_PAID: 'paid', GEMINI_API_KEY: 'plain' }
  it('true: the free tier, the QA key first, then the local key, then GEMINI_API_KEY', () => {
    expect(aiKeyFor({ IS_QA: true, ...keys })).toEqual({ AI_KEY_TIER: 'free', GEMINI_API_KEY: 'qa-free' })
    expect(aiKeyFor({ IS_QA: true, ...keys, GEMINI_API_KEY_QA: undefined })).toEqual({ AI_KEY_TIER: 'free', GEMINI_API_KEY: 'local-free' })
    expect(aiKeyFor({ IS_QA: true, GEMINI_API_KEY: 'plain' })).toEqual({ AI_KEY_TIER: 'free', GEMINI_API_KEY: 'plain' })
  })
  it('false: the paid tier, the PAID key first, then GEMINI_API_KEY (the live server stores its paid key as GEMINI_API_KEY); never a free key', () => {
    expect(aiKeyFor({ IS_QA: false, ...keys })).toEqual({ AI_KEY_TIER: 'paid', GEMINI_API_KEY: 'paid' })
    expect(aiKeyFor({ IS_QA: false, GEMINI_API_KEY: 'plain', GEMINI_API_KEY_QA: 'qa-free' })).toEqual({ AI_KEY_TIER: 'paid', GEMINI_API_KEY: 'plain' })
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
