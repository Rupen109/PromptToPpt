/**
 * Compares decks made from the same prompts by two models (input: e2e/results/model-compare.json written by e2e/compare-models.mjs).
 *   tsx --env-file-if-exists=.env scripts/model-compare-report.ts
 * Objective measures only (the reading of the actual text is a human job): structure, text habits, invented numbers, layout validity, the quality gate, speed, cost.
 */
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { db, pool } from '../src/db/index.ts'
import { textOf } from '../src/generation/quality.ts'

const runs = JSON.parse(readFileSync(new URL('../../../e2e/results/model-compare.json', import.meta.url), 'utf8')) as { key: string; label: string; model: string; jobId?: string; presentationId?: string; seconds?: number; error?: string }[]
const PROMPT_TEXT: Record<string, string> = {
  party: "10 slide plan daughter 7th birthday party unicorn theme games cake decorations budget rupees",
  security: '10 slide quarterly cybersecurity incident review board phishing attack contained lessons learned next steps',
  poetry: '10 slide lecture Romantic poetry undergraduate literature Wordsworth Keats Shelley famous lines',
  fintech: '10 slide seed round pitch deck fintech app gig workers India save taxes',
  sales: '10 slide quarterly sales review revenue 4.2 crore rupees 18% 320 new customers churn 2.1% West region January two large renewals',
  hindi: '10 स्वस्थ खान-पान',
}
const numbersIn = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, ''))
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const GENERIC = /^(overview|introduction|conclusion|summary|key takeaways|next steps|thank you|agenda|background|questions)\b/i
const jaccard = (a: string, b: string) => { const A = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3)), B = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3)); const i = [...A].filter((x) => B.has(x)).length; return i / Math.max(1, A.size + B.size - i) }

const rows: Record<string, unknown>[] = []
for (const r of runs) {
  if (!r.presentationId) { rows.push({ key: r.key, model: r.label, error: r.error }); continue }
  const [v] = (await db.execute(sql`select v.document from presentation_version v join presentation p on p.id=v.presentation_id and v.version=p.latest_version where p.id=${r.presentationId}`)).rows as { document: Presentation }[]
  const doc = v!.document
  const slides = doc.slides
  const contents = slides.map((s) => s.content as SlideContent | undefined).filter(Boolean) as SlideContent[]
  const texts = contents.map((c) => textOf(c).join(' '))
  const bullets = contents.flatMap((c) => ('bullets' in c ? c.bullets : []))
  const titles = contents.map((c) => ('title' in c ? c.title : '')).filter(Boolean)
  const allowed = new Set(numbersIn(PROMPT_TEXT[r.key] ?? ''))
  const invented = [...new Set(numbersIn(texts.join(' ')))].filter((n) => !allowed.has(n) && !/^\d{1,2}$/.test(n))
  let dup = 0
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (jaccard(texts[i]!, texts[j]!) > 0.6) dup++
  const issues = slides.flatMap((s) => s.validation?.issues ?? [])
  const [job] = (await db.execute(sql`select checkpoint from generation_job where id=${r.jobId}`)).rows as { checkpoint: { report?: { remaining?: { kind: string }[] } } }[]
  const [cost] = (await db.execute(sql`select count(*) filter (where request_type='slide_content')::int slide_calls, count(*) filter (where request_type='deck_critic')::int critic, count(*) filter (where status='error')::int errors, coalesce(sum(provider_cost_usd),0)::float8 usd, coalesce(sum(output_tokens),0)::int out_tokens from ai_usage_event where job_id=${r.jobId}`)).rows as { slide_calls: number; critic: number; errors: number; usd: number; out_tokens: number }[]
  rows.push({
    key: r.key, model: r.label, seconds: r.seconds, slides: slides.length,
    layouts: new Set(slides.map((s) => s.layoutId)).size,
    wordsPerSlide: +(texts.reduce((a, t) => a + words(t), 0) / Math.max(1, texts.length)).toFixed(1),
    wordsPerBullet: +(bullets.reduce((a, b) => a + words(b), 0) / Math.max(1, bullets.length)).toFixed(1),
    titleWords: +(titles.reduce((a, t) => a + words(t ?? ""), 0) / Math.max(1, titles.length)).toFixed(1),
    genericTitles: titles.filter((t) => GENERIC.test((t ?? "").trim())).length,
    similarSlidePairs: dup,
    inventedNumbers: invented.length, invented: invented.slice(0, 6).join(' '),
    overflow: issues.filter((i) => i.code === 'overflow' && i.severity === 'error').length,
    smallText: issues.filter((i) => i.code === 'small_text').length,
    gateLeft: job?.checkpoint?.report?.remaining?.length ?? 0, gateKinds: [...new Set((job?.checkpoint?.report?.remaining ?? []).map((x) => x.kind))].join(','),
    slideCalls: cost?.slide_calls, critic: cost?.critic, errors: cost?.errors, costUsd: +(cost?.usd ?? 0).toFixed(4),
  })
}
console.table(rows)
const agg = (label: string, f: string) => { const xs = rows.filter((x) => x['model'] === label && typeof x[f] === 'number').map((x) => x[f] as number); return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : NaN }
console.log('\nAVERAGES (lite vs std):')
for (const f of ['seconds', 'layouts', 'wordsPerSlide', 'wordsPerBullet', 'titleWords', 'genericTitles', 'similarSlidePairs', 'inventedNumbers', 'overflow', 'smallText', 'gateLeft', 'slideCalls', 'critic', 'errors', 'costUsd']) console.log(f.padEnd(18), String(agg('lite', f)).padStart(8), String(agg('std', f)).padStart(8))
await pool.end()
