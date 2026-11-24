import type { Presentation } from '@prompttoppt/validation'
import type { Check, SkipReason } from './evaluate'
import type { Expectation, ThemePart } from './expectations'

/**
 * The ONLY place that words what happened. Every sentence is built from verified checks (evaluate.ts), never from the model's prose and never from the plan: "Done" is a fact about the deck.
 * The answer ends in one of: done, partly done, nothing changed (with the reasons), or nothing needed changing.
 */
export interface Composed {
  /** the chat's first line */
  reply: string
  /** things that really happened (shown with a tick) */
  applied: string[]
  /** what did not happen and why, and what was already so (shown as notes) */
  notes: string[]
  outcome: 'done' | 'partial' | 'nothing' | 'already' | 'info'
  counts: { done: number; failed: number; unchanged: number }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const listOf = (nums: number[]) => { const n = [...new Set(nums)].filter((x) => x > 0).sort((a, b) => a - b); return n.length === 0 ? 'a slide' : n.length === 1 ? `slide ${n[0]}` : `slides ${n.slice(0, -1).join(', ')} and ${n.at(-1)}` }
const PART: Record<ThemePart, string> = { colours: 'colours', fonts: 'fonts', style: 'design style', motion: 'animation', design: 'design', mode: 'light/dark mode', logo: 'logo' }

interface Row { e: Expectation; c: Check }

/** a group key: results that read as one sentence ("Rewrote the text on slides 1, 3 and 5") */
const groupOf = (e: Expectation): string => (e.kind === 'background_copy' ? `background_copy:${e.fromSlideId}` : e.kind === 'edit' ? `edit:${e.change}` : e.kind === 'lock' ? `lock:${e.locked}` : e.kind === 'transition' ? `transition:${e.to.type}` : e.kind === 'element' ? `element:${e.change.verb}` : e.kind === 'picture_swap' && e.replaced ? (e.source === 'photo' ? 'swap:photo' : 'swap:replace') : e.kind)

const DONE: Record<string, (rows: Row[], num: (r: Row) => number, doc: Presentation, group: string) => string> = {
  theme: (rows) => {
    const e = rows[0]!.e as Extract<Expectation, { kind: 'theme' }>
    if (e.parts.includes('design') && e.to.name) return `Applied the ${e.to.name} design`
    if (e.parts.length === 1 && e.parts[0] === 'mode') return `Switched to ${e.mode} mode`
    const names = e.parts.map((p) => (p === 'mode' ? `${e.mode} mode` : PART[p]))
    return `Changed the ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} of the whole deck`
  },
  'edit:text': (rows, num) => `Rewrote the text on ${listOf(rows.map(num))}`,
  'edit:notes': (rows, num) => `Wrote the speaker notes of ${listOf(rows.map(num))}`,
  'edit:layout': (rows, num) => `Changed the layout of ${listOf(rows.map(num))}`,
  'edit:picture_off': (rows, num) => `Removed the picture from ${listOf(rows.map(num))} (the words stay, in a text layout)`,
  addition: (rows, num) => `Added ${rows.length === 1 ? 'a slide' : `${rows.length} slides`} (${listOf(rows.map(num))})`,
  background: (rows, num) => `Changed the background of ${listOf(rows.map(num))}`,
  background_copy: (rows, num, doc) => { const e = rows[0]!.e as Extract<Expectation, { kind: 'background_copy' }>; const n = doc.slides.findIndex((x) => x.id === e.fromSlideId) + 1; return `Gave ${listOf(rows.map(num))} the background of ${n ? `slide ${n}` : 'that slide'}` },
  slide_brand: (rows, num) => { const b = rows[0]!.e.kind === 'slide_brand' ? rows[0]!.e.brand : null; return b ? `Applied ${b.name ? `the ${b.name} brand` : 'your brand'} to ${listOf(rows.map(num))}` : `Put ${listOf(rows.map(num))} back in the deck's own look` },
  background_pattern: (rows, num) => { const k = rows[0]!.e.kind === 'background_pattern' ? rows[0]!.e.pattern : null; return k ? `Gave ${listOf(rows.map(num))} a ${k === 'grid' ? 'grid' : k === 'dots' ? 'dotted' : k === 'lines' ? 'lined' : 'diagonal-line'} background pattern` : `Took the pattern off the background of ${listOf(rows.map(num))}` },
  background_blur: (rows, num) => (rows.every((r) => r.e.kind === 'background_blur' && r.e.blur === 0) ? `Made the background picture of ${listOf(rows.map(num))} sharp again` : `Softened the background picture of ${listOf(rows.map(num))}`),
  gradient: (rows, num) => `Gave ${listOf(rows.map(num))} a ${rows.every((r) => r.e.kind === 'gradient' && r.e.radial) ? 'radial ' : ''}gradient background`,
  clear_pictures: (rows, num) => `Removed the pictures from ${listOf(rows.map(num))}`,
  picture_swap: (rows, num) => `Removed the background of ${rows.length > 1 ? 'pictures' : 'the picture'} on ${listOf(rows.map(num))} (the new picture is transparent)`,
  'swap:replace': (rows, num) => `Replaced the picture on ${listOf(rows.map(num))} with your uploaded picture`,
  'swap:photo': (rows, num) => `Replaced the picture on ${listOf(rows.map(num))} with a new photo`,
  readability: (rows, num) => `Made the text on ${listOf(rows.map(num))} readable`,
  photo: (rows, num) => `Added a picture to ${listOf(rows.map(num))}`,
  // the slide the person NAMED (its number when they asked), then where the result is now: "duplicate slide 2" never reads "Duplicated slide 3"
  duplicate: (rows, num) => { const from = rows.map((r) => (r.e as { from?: number }).from ?? 0); return from.every((n) => n > 0) ? `Duplicated ${listOf(from)} (the cop${rows.length === 1 ? 'y is' : 'ies are'} ${listOf(rows.map(num))})` : `Duplicated ${listOf(rows.map(num))}` },
  move: (rows, num) => { const from = rows.map((r) => (r.e as { from?: number }).from ?? 0); return from.every((n) => n > 0) ? `Moved ${listOf(from)} (now ${listOf(rows.map(num))})` : `Moved ${listOf(rows.map(num))}` },
  transition: (rows, num) => { const to = (rows[0]!.e as Extract<Expectation, { kind: 'transition' }>).to; return `Set how ${listOf(rows.map(num))} ${rows.length > 1 ? 'arrive' : 'arrives'}: ${TRANSITION_WORD[to.type]}` },
  'lock:true': (rows, num) => `Locked ${listOf(rows.map(num))} (the AI will not change it)`,
  'lock:false': (rows, num) => `Unlocked ${listOf(rows.map(num))}`,
  removal: (rows) => `Deleted ${listOf(rows.map((r) => (r.e as Extract<Expectation, { kind: 'removal' }>).slideNo))}`,
  revert: () => 'Put back my last change',
  element: (rows, num, _doc, group) => {
    const verb = group.slice('element:'.length) // the wording this group stands for (an object may have several: "bigger" and "to the right")
    const descs = [...new Set(rows.map((r) => (r.e as Extract<Expectation, { kind: 'element' }>).change.desc))]
    const what = descs.length > 1 ? `${descs.slice(0, -1).join(', ')} and ${descs.at(-1)}` : descs[0]!
    // the first {} names the object and where it is; a second one in the same sentence ("hid the legend of {} and showed the figures on {}") is "it" / "them"
    return verb.replace('{}', `${what}${rows.length > descs.length ? ` (${rows.length} items)` : ''} on ${listOf(rows.map(num))}`).replaceAll('{}', rows.length > 1 ? 'them' : 'it')
  },
}

const TRANSITION_WORD = { none: 'no transition', fade: 'fade', slide: 'slide', zoom: 'zoom', push: 'push', wipe: 'wipe', morph: 'Morph' } as const

const SAME: Record<string, string> = {
  transition: 'already arrived like that',
  theme: 'The design is already like that', background: 'already had that background', clear_pictures: 'had no picture to remove', readability: 'was already readable',
  'lock:true': 'was already locked', 'lock:false': 'was not locked', move: 'was already there', edit: 'already read like that', element: 'was already like that',
}

const WHY = (reason: SkipReason, plural: boolean, where: string, what: string): string => {
  switch (reason) {
    case 'locked': return `${where} ${plural ? 'are' : 'is'} locked, so I left ${plural ? 'them' : 'it'}.`
    case 'missing_slide': return `${where === 'a slide' ? 'A slide this change needed' : where} ${plural ? 'are' : 'is'} no longer in the deck, so nothing changed there.`
    case 'missing_element': return `The picture on ${where} is no longer there, so I could not change it.`
    case 'not_image': return `The object on ${where} is not a picture any more, so I left it.`
    case 'no_transparency': return `The picture for ${where} came out without a transparent background, so I did not use it.`
    case 'last_slide': return 'A presentation needs at least one slide, so I kept it.'
    default: return `${what} did not take effect on ${where}, so it was left as it was.`
  }
}
const WHAT: Record<string, string> = {
  'swap:replace': 'The new picture',
  'swap:photo': 'The new photo',
  theme: 'The design change', edit: 'The text change', addition: 'The new slide', background: 'The background change', background_copy: 'Copying the background', gradient: 'The gradient', background_blur: 'Softening the background picture', background_pattern: 'The background pattern', slide_brand: 'The brand change', clear_pictures: 'Removing the pictures',
  picture_swap: 'The new picture', readability: 'The text fix', photo: 'The picture', duplicate: 'The copy', move: 'The move', lock: 'The lock change', transition: 'The transition change', removal: 'Deleting the slide', revert: 'Putting it back', element: 'The change',
}

/** the kinds of the server's notes (decided where each was written): a part of the request NOT done, a part that already was so */
export interface NoteKinds { refused: string[]; already: string[] }

export function compose(expectations: Expectation[], checks: Check[], doc: Presentation, extraNotes: string[] = [], kinds: NoteKinds = { refused: [], already: [] }): Composed {
  const byKey = new Map(checks.map((c) => [c.key, c]))
  const rows: Row[] = expectations.flatMap((e) => { const c = byKey.get(e.key); return c ? [{ e, c }] : [] })
  const slideNo = (id: string | undefined, fallback = 0) => { const i = id ? doc.slides.findIndex((s) => s.id === id) : -1; return i >= 0 ? i + 1 : fallback }
  const numOf = (r: Row): number => {
    const e = r.e
    if (e.kind === 'addition') return slideNo(e.id)
    if (e.kind === 'duplicate') return slideNo(e.newId)
    if (e.kind === 'removal') return e.slideNo
    if (e.kind === 'element') return slideNo(e.change.slideId)
    return 'slideId' in e ? slideNo(e.slideId) : 0
  }
  const applied: string[] = [], notes: string[] = [], infos: string[] = []
  const groups = new Map<string, Row[]>()
  const join = (g: string, r: Row) => groups.set(g, [...(groups.get(g) ?? []), r])
  // an object with several operations ("bigger and to the right") is one row that reads as one sentence per operation
  for (const r of rows) { if (r.e.kind === 'element') for (const verb of [r.e.change.verb, ...(r.e.change.alsoVerbs ?? [])]) join(`element:${verb}`, r); else join(groupOf(r.e), r) }
  let done = 0, failed = 0, unchanged = 0
  for (const r of rows) { if (r.c.status === 'done') done++; else if (r.c.status === 'unchanged') unchanged++; else if (r.c.status === 'failed' || r.c.status === 'skipped') failed++ }
  for (const [g, list] of groups) {
    const base = list[0]!.e.kind
    const ok = list.filter((r) => r.c.status === 'done'), same = list.filter((r) => r.c.status === 'unchanged'), bad = list.filter((r) => r.c.status === 'failed' || r.c.status === 'skipped'), info = list.filter((r) => r.c.status === 'info')
    if (ok.length) applied.push((DONE[g] ?? DONE[base] ?? (() => 'Made a change'))(ok, numOf, doc, g))
    if (same.length) notes.push(base === 'theme' ? `${SAME['theme']}.` : `${listOf(same.map(numOf))} ${SAME[g] ?? SAME[base] ?? 'already was like that'}.`)
    if (base === 'element') {
      for (const r of bad) {
        const c = (r.e as Extract<Expectation, { kind: 'element' }>).change, n = numOf(r)
        const at = `${c.desc} on slide ${n}`
        notes.push(r.c.reason === 'locked' ? (r.c.evidence[0] === 'the element is locked' ? `${at.charAt(0).toUpperCase()}${at.slice(1)} is locked, so I left it.` : `Slide ${n} is locked, so I left it.`)
          : r.c.reason === 'missing_element' ? `${at.charAt(0).toUpperCase()}${at.slice(1)} is no longer there, so I could not change it.`
          : r.c.reason === 'missing_slide' ? 'A slide this change needed is no longer in the deck, so nothing changed there.'
          : `The change to ${at} did not take effect, so it was left as it was.`)
      }
    }
    const byReason = new Map<SkipReason, Row[]>()
    for (const r of base === 'element' ? [] : bad) byReason.set(r.c.reason ?? 'not_applied', [...(byReason.get(r.c.reason ?? 'not_applied') ?? []), r])
    for (const [reason, rs] of byReason) {
      const nums = rs.map(numOf).filter((n) => n > 0)
      const where = listOf(nums)
      notes.push(WHY(reason, new Set(nums).size > 1, where, WHAT[base] ?? 'That change'))
    }
    for (const r of info) {
      if (r.e.kind === 'proposal') infos.push(`Proposed ${r.e.count === 1 ? 'a picture' : `${r.e.count} pictures`} — confirm below to generate ${r.e.count === 1 ? 'it' : 'them'}.`)
      if (r.e.kind === 'rewrite') infos.push(r.e.picturesOnly ? "I'll pick new pictures that match each slide and keep your text." : "I'll rebuild every slide from your details, keeping this design.")
    }
  }
  notes.push(...infos, ...extraNotes)
  const uniqueNotes = [...new Set(notes)]
  notes.length = 0; notes.push(...uniqueNotes)
  // parts of the request refused BEFORE anything ran (a locked slide, no room, a plan limit) count like changes that failed: the headline never reads as if everything was done
  const refused = new Set(kinds.refused.filter((t) => notes.includes(t))).size
  const alreadyNotes = kinds.already.filter((t) => notes.includes(t)).length
  const outcome: Composed['outcome'] = done > 0 ? (failed > 0 || refused > 0 ? 'partial' : 'done') : failed > 0 || refused > 0 ? 'nothing' : unchanged > 0 || alreadyNotes > 0 ? 'already' : 'info'
  const pointer = notes.length ? ' See the notes below.' : ''
  const what = applied.length === 1 && done === 1 ? lowerFirst(applied[0]!) : `${done} change${done === 1 ? '' : 's'} applied`
  const reply = outcome === 'done' ? `Done — ${what}.${pointer}`
    : outcome === 'partial' ? (refused > 0 ? `Partly done — ${what}, but I couldn't do ${refused + failed === 1 ? 'one part' : `${refused + failed} parts`} of it. See the notes below.` : `Partly done — ${done} of ${done + failed} changes applied. See the notes below.`)
    : outcome === 'nothing' ? (refused > 0 && failed === 0 ? `I couldn't do that — nothing was changed. See the note${notes.length === 1 ? '' : 's'} below.` : "I couldn't apply that — nothing was changed. See the notes below.")
    : outcome === 'already' ? 'Nothing needed changing — it was already like that.'
    : infos[0] ?? 'Done.'
  return { reply, applied, notes, outcome, counts: { done, failed, unchanged } }
}
