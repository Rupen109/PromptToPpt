/** Summarises what the server recorded for ONE customer of a pricing run (by e-mail). tsx --env-file-if-exists=.env scripts/pricing-report.ts <email> <plan> */
import { and, eq, sql } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { aiUsageEvent, creditLedger, generationJob, presentation, user } from '../src/db/schema.ts'
const [email, planId] = [process.argv[2]!, process.argv[3]!]
const NET: Record<string, { india: number; intl: number; allowance: number }> = { pro: { india: 4.67, intl: 14.27, allowance: 3000 }, gold: { india: 11.23, intl: 28.83, allowance: 10000 } }
const [u] = await db.select().from(user).where(eq(user.email, email))
const num = (x: unknown) => Number(x ?? 0)
const usage = await db.select({ type: aiUsageEvent.requestType, model: aiUsageEvent.model, n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${aiUsageEvent.status}='success')::int`, inTok: sql<number>`coalesce(sum(${aiUsageEvent.inputTokens}),0)::int`, outTok: sql<number>`coalesce(sum(${aiUsageEvent.outputTokens}+${aiUsageEvent.reasoningTokens}),0)::int`, images: sql<number>`coalesce(sum(${aiUsageEvent.imageCount}),0)::int`, cost: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}),0)`, ms: sql<number>`coalesce(avg(${aiUsageEvent.latencyMs}),0)::int` }).from(aiUsageEvent).where(eq(aiUsageEvent.userId, u!.id)).groupBy(aiUsageEvent.requestType, aiUsageEvent.model)
const byType = await db.select({ type: aiUsageEvent.requestType, n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${aiUsageEvent.status}='success')::int`, cost: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}),0)`, failedCost: sql<string>`coalesce(sum(${aiUsageEvent.providerCostUsd}) filter (where ${aiUsageEvent.status}='error'),0)` }).from(aiUsageEvent).where(eq(aiUsageEvent.userId, u!.id)).groupBy(aiUsageEvent.requestType)
const ledger = await db.select({ reason: creditLedger.reason, n: sql<number>`count(*)::int`, delta: sql<number>`sum(${creditLedger.delta})::int` }).from(creditLedger).where(eq(creditLedger.userId, u!.id)).groupBy(creditLedger.reason)
const decks = Number((await db.select({ n: sql<number>`count(*)` }).from(presentation).where(eq(presentation.userId, u!.id)))[0]!.n)
const jobs = await db.select({ s: generationJob.status, n: sql<number>`count(*)::int` }).from(generationJob).where(eq(generationJob.userId, u!.id)).groupBy(generationJob.status)
const total = usage.reduce((a, x) => a + num(x.cost), 0)
const spent = -ledger.filter((l) => ['reserve', 'refund'].includes(l.reason)).reduce((a, l) => a + l.delta, 0)
const n = NET[planId]!
console.log(`${planId} · ${email}\ndecks ${decks} · jobs ${JSON.stringify(jobs)}\nnet credits spent ${spent} of ${n.allowance} · real model cost $${total.toFixed(4)} · per 1000 credits $${((total / spent) * 1000).toFixed(4)} · per deck $${(total / Math.max(1, decks)).toFixed(4)}`)
console.log(`full allowance at this mix ≈ $${((total / spent) * n.allowance).toFixed(2)} → margin India ${(100 * (1 - ((total / spent) * n.allowance) / n.india)).toFixed(0)} % · international ${(100 * (1 - ((total / spent) * n.allowance) / n.intl)).toFixed(0)} %`)
console.table(byType.map((t) => ({ type: t.type, calls: t.n, ok: t.ok, costUsd: +num(t.cost).toFixed(4), costOfFailedUsd: +num(t.failedCost).toFixed(4), avgPerCallUsd: +(num(t.cost) / t.n).toFixed(5) })))
console.table(usage.map((x) => ({ type: x.type, model: x.model, calls: x.n, ok: x.ok, inTok: x.inTok, outTok: x.outTok, images: x.images, costUsd: +num(x.cost).toFixed(4), avgMs: x.ms })))
console.log('ledger', JSON.stringify(ledger))
await pool.end()
