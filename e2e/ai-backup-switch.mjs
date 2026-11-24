/**
 * The backup takes over (docs/AI_EDIT_V3_ARCHITECTURE.md "AI provider: Gemini direct, OpenRouter as backup"): a REAL browser builds a deck with a real model while the
 * main provider (Gemini direct) refuses every call. Pass = the deck is built, every model answer came through the backup (provider "openrouter" in the usage ledger)
 * on the SAME Gemini model the person picked, Gemini's refusals are in the ledger too, and the owner's ALERT line is in the API log.
 *
 * Run it against an API started for the test (development only; env.ts refuses these settings in production):
 *   (OpenRouter's key in the environment as OPENROUTER_API_KEY)  AI_BACKUP_PROVIDER=openrouter AI_TEST_MAIN_REFUSAL=402 [OPENROUTER_BASE_URL=<local stand-in>] pnpm exec tsx --env-file-if-exists=.env src/index.ts > api.log
 *   E2E_WEB=http://localhost:3100 API_LOG=<that api.log> node e2e/ai-backup-switch.mjs
 * With a real OpenRouter key leave OPENROUTER_BASE_URL out: the backup is then OpenRouter itself (spend: one short deck).
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { EDITOR, expect, launch, signUpAndEnter, startBuild, suite, uniqueEmail } from './lib.mjs'

const root = new URL('..', import.meta.url).pathname
const tsx = (script, args) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env ${script} ${args}`, { cwd: root, stdio: 'pipe' }).toString()

const s = suite('ai-backup-switch')
const b = await launch()
try {
  const p = await (await b.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  const email = uniqueEmail('backup')
  await signUpAndEnter(p, { email })
  tsx('scripts/qa-grant-plan.ts', `${email} premium`)
  let deckId
  await s.check('Premium\'s model picker offers Gemini models only, as Standard and Pro', p, async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill('A 3 slide presentation on how solar panels work, for school students')
    await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/)
    const picker = p.getByRole('radiogroup', { name: 'AI model' })
    await picker.waitFor({ timeout: 120000 }).catch(async () => { await p.getByRole('button', { name: /Let AI decide/ }).click(); await picker.waitFor({ timeout: 90000 }) })
    const text = await picker.innerText()
    expect(/STANDARD MODELS/.test(text) && /PRO MODELS/.test(text), `picker groups: ${text.slice(0, 200)}`)
    expect(/Gemini 3\.1 Pro/.test(text) && !/Claude|GLM|Anthropic|Z\.ai/i.test(text), `picker models: ${text.replace(/\n/g, ' | ').slice(0, 400)}`)
  })
  await s.check('with Gemini refusing (credit used up), a deck on Gemini 3.1 Pro is built through the backup on the SAME model', p, async () => {
    await startBuild(p, { model: /3\.1 Pro/ })
    await p.waitForURL(/\/edit\//, { timeout: 300000 })
    deckId = p.url().split('/edit/')[1]
    await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
    const doc = await p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document, deckId)
    expect(doc.slides.length >= 3, `slides: ${doc.slides.length}`)
  })
  await s.check('the usage ledger: Gemini\'s refusals recorded, every answer from the backup, and the deck charged at the Pro model\'s credit class', p, async () => {
    const out = tsx('scripts/qa-ledger-for.ts', email)
    const { usage: rows, credits } = JSON.parse(out.slice(out.indexOf('{')))
    const ok = rows.filter((r) => r.status === 'success'), refused = rows.filter((r) => r.status === 'error' && r.provider === 'vertex')
    expect(ok.length > 0 && ok.every((r) => r.provider === 'openrouter'), `answers not all from the backup: ${JSON.stringify(ok.map((r) => `${r.provider}:${r.model}`))}`)
    expect(ok.some((r) => r.model === 'google/gemini-3.1-pro-preview'), `the deck did not run on Gemini 3.1 Pro: ${JSON.stringify(ok.map((r) => r.model))}`)
    expect(refused.length > 0 && refused.every((r) => r.error_code === 'RESOURCE_EXHAUSTED'), `Gemini refusals: ${JSON.stringify(refused.slice(0, 3))}`)
    expect(refused.length === 1, `after the first refusal Gemini should be passed over (circuit breaker), but it was asked ${refused.length} times`)
    const doc = await p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document, deckId)
    const charged = -credits.filter((c) => c.ref_type === 'job').reduce((a, c) => a + c.delta, 0)
    expect(charged === doc.slides.length * 5, `charged ${charged} credits for ${doc.slides.length} slides (Gemini 3.1 Pro = 5 a slide)`)
  })
  await s.check('the owner is told: an ALERT line names the backup and why Gemini did not answer', p, async () => {
    if (!process.env['API_LOG']) throw new Error('set API_LOG to the test API\'s log file')
    const log = readFileSync(process.env['API_LOG'], 'utf8')
    expect(/\[ai\] ALERT: the BACKUP \(OpenRouter\) answered .*depleted/.test(log), 'no backup ALERT in the API log')
  })
} finally {
  await b.close()
}
s.done()
