import type { z } from 'zod'
import { MANY_WORDS, REVIEW_CHECKS, reviewFindings } from '@prompttoppt/theme'
import { VALUES } from '../understand.ts'
import type { Capability, Step } from './types.ts'
import { text } from './writing.ts'

/**
 * "Fix the problems": the second half of the review flow. It repairs what code can fix SAFELY and says what it left alone. The same findings the review lists decide which slides are touched
 * (no model decides what is wrong): hard-to-read text is fixed by the readability fix (no model, no words change), and slides with too much text, text that does not fit or very small text are
 * shortened by the existing text writer (every figure kept, nothing added). Anything that needs a decision (an empty slide, a missing or repeated title, a repeated layout, a missing picture) is
 * listed with the exact thing to say, never guessed at.
 */
const MAX_REWRITES = 10
const SHORTEN = `Shorten this slide so it has fewer than ${MANY_WORDS} words and its text fits: keep every figure and the key points, drop repetition and filler, and add nothing new.`

/** how many slides the repair would rewrite (used to price it before anything runs) */
export const repairRewriteCount = (findings: ReturnType<typeof reviewFindings>, focus: 'all' | 'text' | 'design'): number => {
  const ids = new Set(findings.filter((f) => ['many_words', 'overflow', 'small_text'].includes(f.id) && focus !== 'design').flatMap((f) => f.slides.map((s) => s.n)))
  return Math.min(MAX_REWRITES, ids.size)
}

export const repair: Capability<z.infer<typeof VALUES.repair>> = {
  family: 'repair', values: VALUES.repair, scope: 'none', cost: 'writing', deckWide: true,
  async run(ctx, _ids, v, problems): Promise<Step> {
    const found = reviewFindings(ctx.virtual)
    const slideId = (n: number) => ctx.virtual.slides[n - 1]!.id
    const ofKind = (ids: string[]) => [...new Set(found.filter((f) => ids.includes(f.id)).flatMap((f) => f.slides.map((s) => s.n)))].sort((a, b) => a - b)
    const ops: Step['ops'] = []
    const notes: string[] = [], refused: string[] = []
    // text that is hard to read: fixed without changing a word
    const hard = v.focus === 'text' ? [] : ofKind(['contrast'])
    for (const n of hard) ops.push({ op: 'fix_readability', slideId: slideId(n) })
    // text that is too long, does not fit or is very small: shortened by the text writer (the same checks and honesty as any rewrite)
    const long = v.focus === 'design' ? [] : ofKind(['many_words', 'overflow', 'small_text'])
    const todo = long.slice(0, MAX_REWRITES)
    if (long.length > todo.length) refused.push(`I shortened the first ${todo.length} slides (${todo.join(', ')}); ${long.length - todo.length} more need it, so ask me again for the rest.`)
    let written = 0
    if (todo.length) {
      // "fix the problems you found" IS the go-ahead for the slides the review listed, so the bulk-rewrite question is not asked again
      const ids = todo.map(slideId)
      const r = await text.run({ ...ctx, confirm: { kind: 'text_bulk', request: SHORTEN, slideIds: ids } }, ids, { request: SHORTEN, useSources: false } as z.infer<typeof VALUES.text>, problems)
      ops.push(...r.ops); notes.push(...(r.notes ?? [])); refused.push(...(r.refused ?? [])); written = r.written ?? 0
    }
    // what needs a decision is not guessed at: listed with what to say
    const left = found.filter((f) => !['contrast', 'many_words', 'overflow', 'small_text'].includes(f.id) && (v.focus === 'all' || REVIEW_CHECKS.find((c) => c.id === f.id)?.focus === v.focus))
    for (const f of left) { const c = REVIEW_CHECKS.find((x) => x.id === f.id)!; notes.push(`Not fixed (it needs your decision): ${f.label} on slide${f.slides.length === 1 ? '' : 's'} ${f.slides.slice(0, 8).map((s) => s.n).join(', ')}. For example say "${c.fix(f.slides[0]!.n)}".`) }
    if (!ops.length && !left.length && !notes.length && !refused.length) return { ops: [], already: ['I found nothing to fix: no slide has too much text, text that does not fit, or text that is hard to read.'] }
    if (!ops.length) return { ops: [], notes, refused }
    return { ops, notes, refused, written }
  },
}
