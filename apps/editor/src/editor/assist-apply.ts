import { produce } from 'immer'
import { collateralChanges, collateralNote, compose, evaluateAll, type Check, type Composed, type Expectation } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { assistSteps, type AssistChanges, type D } from './commands'
import { useDoc } from './store'

/**
 * Applying an assistant answer so that what the chat says is what is in the deck.
 *
 *  1. Every change of the answer is a STEP (commands.ts assistSteps) that uses the editor's own commands.
 *  2. DRY RUN: each step is tried on its own on a plain copy. A step that throws changes nothing (immer is atomic per step) and is left out; the others do not depend on it, so they survive
 *     (a step that needed it finds its target missing and is reported as failed).
 *  3. COMMIT: the surviving steps (and `extra`, e.g. putting back a change) go into the store in ONE `apply`: one undo step, one redo step. Nothing is added to the history when nothing changed.
 *  4. VERIFY: every expectation is checked against the document the store NOW holds, never against what a command returned.
 *  5. COMPOSE: the message is built from those checks only (theme/assist/claims.ts).
 */
export interface AssistAnswer extends AssistChanges {
  /** what the answer promises (built by the server from the answer and the saved deck) */
  expect: Expectation[]
}

export interface AssistApplied {
  checks: Check[]
  composed: Composed
  /** the deck really changed (a new undo step exists) */
  changed: boolean
  /** steps that threw (and were left out), for the log */
  errors: { key: string; message: string }[]
  /** slides that changed although the answer did not name them (rule R6); empty when nothing else moved */
  collateral: number[]
  before: Presentation
  after: Presentation
}

export function applyAssistVerified(answer: AssistAnswer, o: { extra?: (d: D) => void; notes?: string[]; /** the kinds of the server's notes: parts not done, parts already so */ refused?: string[]; already?: string[]; label?: string } = {}): AssistApplied {
  const st = useDoc.getState()
  const before = st.doc
  if (!before) throw new Error('No presentation is open.')
  const steps = assistSteps(answer)
  // 2. dry run
  let cur = before
  const errors: { key: string; message: string }[] = []
  const survivors = steps.filter((s) => {
    try { cur = produce(cur, (d) => { s.apply(d as D) }); return true } catch (e) { errors.push({ key: s.key, message: e instanceof Error ? e.message : String(e) }); return false }
  })
  // 3. commit: one transaction (one undo step); if even this throws, nothing was applied
  try {
    st.apply(o.label ?? 'AI assistant', (d) => { for (const s of survivors) s.apply(d); o.extra?.(d) })
  } catch (e) {
    errors.push({ key: '*', message: e instanceof Error ? e.message : String(e) })
  }
  const after = useDoc.getState().doc!
  // 4. verify on the live document; a step that threw is a failure whatever the document looks like
  const failedKeys = new Set(errors.map((x) => x.key))
  const everything = errors.some((x) => x.key === '*')
  const checks = evaluateAll(answer.expect, after, before).map((c): Check => (everything || failedKeys.has(c.key) ? { key: c.key, kind: c.kind, status: 'failed', reason: 'not_applied', evidence: errors.filter((x) => x.key === c.key || x.key === '*').map((x) => `the step failed: ${x.message}`), ...(c.slideId ? { slideId: c.slideId } : {}) } : c))
  // 5. compose
  // 6. nothing else may have changed: said when it did
  const collateral = collateralChanges(before, after, answer.expect)
  const side = collateralNote(collateral)
  return { checks, composed: compose(answer.expect, checks, after, [...(o.notes ?? []), ...(side ? [side] : [])], { refused: o.refused ?? [], already: o.already ?? [] }), changed: before !== after, errors, collateral, before, after }
}
