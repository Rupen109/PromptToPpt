/**
 * Editing the ORIGINAL document in place (pdf-lib), so what the visitor did not touch stays as the file had it: outline (bookmarks), form, page labels,
 * metadata, XMP, named destinations, optional content, tagged structure, link targets. Page operations are done on the page tree, not by copying pages
 * into a new file: kept pages are the same page objects, deleted pages are dropped together with everything only they used, a duplicated page is a new page
 * object that shares the content of the original.
 *
 * What is dropped on purpose (each is written down in docs/FREE_TOOLS_PLAN.md): an outline entry / link / form field that points at a deleted page; the tagged
 * structure tree when a page was deleted (its tags would point into a page that is gone); form fields and comments on a DUPLICATED page (a second copy of
 * the same field would share its value).
 */
import type { PDFArray, PDFContext, PDFDict, PDFDocument, PDFName, PDFObject, PDFPage, PDFPageLeaf, PDFRef } from 'pdf-lib'
import type { PageState } from './model'

type Lib = typeof import('pdf-lib')

export interface Plan {
  /** the page objects in their final order (kept originals, duplicates, blank pages) */
  pages: { page: PDFPage; kind: 'original' | 'duplicate' | 'blank'; src: number | null; state: PageState }[]
  /** original pages that are not in the output */
  deleted: Set<string>
  /** the page tree had to be rebuilt (anything other than "same pages, same order") */
  restructured: boolean
  /** form fields copied for duplicated pages: copy name -> original name (a value typed for the original goes into its copies too) */
  aliases: Map<string, string>
}

const N = (lib: Lib, s: string): PDFName => lib.PDFName.of(s)
const tagOf = (r: PDFRef): string => r.toString()

/** a dictionary's value, following one reference */
const look = <T extends PDFObject>(ctx: PDFContext, v: PDFObject | undefined): T | undefined => (v === undefined ? undefined : (ctx.lookup(v) as T | undefined))

/** give a page its OWN resource dictionaries (sub-dictionaries copied one level, entries still point at the shared fonts and pictures) so that what is drawn on it is not added to pages that share them */
function ownResources(lib: Lib, ctx: PDFContext, leaf: PDFPageLeaf): void {
  const res = look<PDFDict>(ctx, leaf.get(N(lib, 'Resources')))
  const copy = ctx.obj({})
  if (res instanceof lib.PDFDict) {
    for (const [k, v] of res.entries()) {
      const val = look<PDFObject>(ctx, v)
      copy.set(k, val instanceof lib.PDFDict ? val.clone(ctx) : v)
    }
  }
  leaf.set(N(lib, 'Resources'), copy)
}

/** a direct resource dictionary that was inherited from the page tree and now sits on several pages is written once and referenced */
function shareInherited(lib: Lib, ctx: PDFContext, leaves: PDFPageLeaf[]): void {
  const seen = new Map<PDFDict, number>(), refs = new Map<PDFDict, PDFRef>()
  for (const l of leaves) { const r = l.get(N(lib, 'Resources')); if (r instanceof lib.PDFDict) seen.set(r, (seen.get(r) ?? 0) + 1) }
  for (const l of leaves) {
    const r = l.get(N(lib, 'Resources'))
    if (r instanceof lib.PDFDict && (seen.get(r) ?? 0) > 1) { let ref = refs.get(r); if (!ref) { ref = ctx.register(r); refs.set(r, ref) } l.set(N(lib, 'Resources'), ref) }
  }
}

/** an attribute of a form field, from the field itself or the nearest ancestor that has it (field attributes are inherited down the tree) */
function inherited(lib: Lib, ctx: PDFContext, d: PDFDict, key: string): PDFObject | undefined {
  let cur: PDFDict | undefined = d
  for (let hops = 0; cur && hops < 32; hops++) {
    const v = cur.get(N(lib, key)); if (v !== undefined) return v
    cur = look<PDFDict>(ctx, cur.get(N(lib, 'Parent')))
  }
  return undefined
}
/** the field's full name: the partial names of the field and its ancestors, joined by dots */
function fullName(lib: Lib, ctx: PDFContext, d: PDFDict): string {
  const parts: string[] = []
  let cur: PDFDict | undefined = d
  for (let hops = 0; cur && hops < 32; hops++) {
    const t = cur.get(N(lib, 'T')), v = t === undefined ? undefined : ctx.lookup(t)
    if (v instanceof lib.PDFString || v instanceof lib.PDFHexString) parts.unshift(v.decodeText())
    cur = look<PDFDict>(ctx, cur.get(N(lib, 'Parent')))
  }
  return parts.join('.')
}
const FIELD_ATTRS = ['FT', 'Ff', 'V', 'DV', 'DA', 'Q', 'Opt', 'MaxLen', 'TI', 'I', 'DS', 'RV']

/**
 * Give a duplicated page its own copy of a form field: a NEW field with its own name (original name + `_dup<n>`) that holds the same value, whose widgets
 * are copies of the widgets that sit on this page. The copy is a root field (attributes the original inherited from its parents are copied onto it).
 * `aliases` records copy -> original, so the visitor's value for a field is written to its copies as well (the same field looks the same on every page).
 */
function copyField(lib: Lib, doc: PDFDocument, widget: PDFDict, pageRef: PDFRef, made: Map<string, { field: PDFDict; kids: PDFObject[] }>, aliases: Map<string, string>): PDFObject | undefined {
  const ctx = doc.context
  const parentRef = widget.get(N(lib, 'Parent'))
  const hasOwnName = widget.get(N(lib, 'T')) !== undefined
  // the terminal field: the widget itself (merged) or its parent (the widget is one of several kids)
  const field = hasOwnName || !(parentRef instanceof lib.PDFRef) ? widget : look<PDFDict>(ctx, parentRef)
  if (!(field instanceof lib.PDFDict)) return undefined
  const name = fullName(lib, ctx, field)
  if (!name) return undefined
  const key = field === widget ? `w:${ctx.getObjectRef(widget)?.toString() ?? name}:${made.size}` : `f:${tagOf(parentRef as PDFRef)}`
  const wcopy = widget.clone(ctx)
  wcopy.set(N(lib, 'P'), pageRef); wcopy.delete(N(lib, 'StructParent')); wcopy.delete(N(lib, 'Popup'))
  if (field === widget) {
    // a field that is its own widget: the copy is a root field with a new name
    for (const k of FIELD_ATTRS) { const v = inherited(lib, ctx, widget, k); if (v !== undefined && wcopy.get(N(lib, k)) === undefined) wcopy.set(N(lib, k), v) }
    const nm = `${name.replace(/\./g, '_')}_dup${aliases.size + 1}`
    wcopy.set(N(lib, 'T'), lib.PDFHexString.fromText(nm)); wcopy.delete(N(lib, 'Parent'))
    aliases.set(nm, name)
    return ctx.register(wcopy)
  }
  // one of several widgets of a field (check boxes in a group, radio buttons): a new group per duplicated page, holding this page's widgets
  let g = made.get(key)
  if (!g) {
    const fcopy = ctx.obj({}) as PDFDict
    for (const k of FIELD_ATTRS) { const v = inherited(lib, ctx, field, k); if (v !== undefined) fcopy.set(N(lib, k), v) }
    const nm = `${name.replace(/\./g, '_')}_dup${aliases.size + 1}`
    fcopy.set(N(lib, 'T'), lib.PDFHexString.fromText(nm)); aliases.set(nm, name)
    g = { field: fcopy, kids: [] }; made.set(key, g)
  }
  const wref = ctx.register(wcopy)
  wcopy.set(N(lib, 'Parent'), ctx.register(g.field)); g.kids.push(wref)
  g.field.set(N(lib, 'Kids'), ctx.obj(g.kids))
  return wref
}

/** the page leaf of a duplicate: its own page object and content list (streams shared), its own copies of the links, comments and form fields */
function duplicateLeaf(lib: Lib, doc: PDFDocument, orig: PDFPageLeaf, aliases: Map<string, string>): PDFPage {
  const ctx = doc.context
  const leaf = orig.clone(ctx)
  const c = orig.get(N(lib, 'Contents')), v = c instanceof lib.PDFRef ? ctx.lookup(c) : c
  leaf.set(N(lib, 'Contents'), ctx.obj(v instanceof lib.PDFArray ? v.asArray() : c ? [c] : []))
  for (const k of ['StructParents', 'B', 'Thumb']) leaf.delete(N(lib, k))
  const ref = ctx.register(leaf)
  const annots = look<PDFArray>(ctx, orig.get(N(lib, 'Annots')))
  if (annots instanceof lib.PDFArray) {
    const own: PDFObject[] = []
    const copies = new Map<string, PDFRef>()  // original annotation -> its copy (replies and pop-ups follow)
    const made = new Map<string, { field: PDFDict; kids: PDFObject[] }>()
    const newFields: PDFObject[] = []
    const pairs: { orig: PDFDict; copy: PDFDict }[] = []
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookupMaybe(i, lib.PDFDict), aref = annots.get(i)
      const st = a?.lookup(N(lib, 'Subtype'))
      if (!a || !(st instanceof lib.PDFName) || st.decodeText() === 'Popup') continue
      if (st.decodeText() === 'Widget') {
        const before = made.size
        const w = copyField(lib, doc, a, ref, made, aliases)
        if (w) {
          own.push(w)
          // fields that are their own widget are registered in the form directly; groups once, when first made
          const wd = ctx.lookup(w) as PDFDict
          const par = wd.get(N(lib, 'Parent'))
          if (!(par instanceof lib.PDFRef)) newFields.push(w); else if (made.size > before) newFields.push(par)
        }
        continue
      }
      const copy = a.clone(ctx); copy.delete(N(lib, 'StructParent')); copy.set(N(lib, 'P'), ref)
      const cref = ctx.register(copy); own.push(cref)
      if (aref instanceof lib.PDFRef) copies.set(tagOf(aref), cref)
      pairs.push({ orig: a, copy })
    }
    // pop-ups (the note window of a comment) and replies (/IRT) follow the copy they belong to
    for (const { orig: o, copy: cp } of pairs) {
      const popup = o.get(N(lib, 'Popup')), pd = look<PDFDict>(ctx, popup)
      if (pd instanceof lib.PDFDict) {
        const pc = pd.clone(ctx), cref = [...copies.entries()].find(([, v]) => ctx.lookup(v) === cp)?.[1]
        if (cref) pc.set(N(lib, 'Parent'), cref)
        pc.set(N(lib, 'P'), ref)
        const pref = ctx.register(pc); cp.set(N(lib, 'Popup'), pref); own.push(pref)
      } else cp.delete(N(lib, 'Popup'))
      const irt = o.get(N(lib, 'IRT')); if (irt instanceof lib.PDFRef) { const m = copies.get(tagOf(irt)); if (m) cp.set(N(lib, 'IRT'), m); else cp.delete(N(lib, 'IRT')) }
    }
    leaf.set(N(lib, 'Annots'), ctx.obj(own))
    if (newFields.length) {
      const form = doc.catalog.lookupMaybe(N(lib, 'AcroForm'), lib.PDFDict)
      const fields = form?.lookupMaybe(N(lib, 'Fields'), lib.PDFArray)
      if (fields) for (const f of newFields) fields.push(f)
    }
  }
  return lib.PDFPage.of(leaf, ref, doc)
}

/** page list in its final form; the page tree is rewritten only when needed */
export function planPages(lib: Lib, doc: PDFDocument, states: PageState[]): Plan {
  const ctx = doc.context
  const originals = doc.getPages()
  const used = new Set<number>(); for (const s of states) if (s.src !== null) used.add(s.src)
  const same = states.length === originals.length && states.every((s, i) => s.src === i)
  const deleted = new Set<string>(); originals.forEach((p, i) => { if (!used.has(i)) deleted.add(tagOf(p.ref)) })
  const edited = new Set<number>(); states.forEach((s) => { if (s.src !== null && (s.annos.length > 0 || s.turn !== 0)) edited.add(s.src) })
  // inherited size / rotation / resources are copied onto the page objects that move to a new parent; pages that stay where they are are only touched when edited
  for (const i of same ? edited : used) originals[i]!.node.normalize()
  if (!same) shareInherited(lib, ctx, [...used].map((i) => originals[i]!.node))
  const first = new Set<number>()
  const aliases = new Map<string, string>()
  const pages: Plan['pages'] = states.map((s) => {
    if (s.src === null) {
      const [x0, y0, x1, y1] = s.geom.view
      const page = lib.PDFPage.create(doc); page.setSize(x1 - x0, y1 - y0)
      return { page, kind: 'blank' as const, src: null, state: s }
    }
    const orig = originals[s.src]!
    if (!first.has(s.src)) { first.add(s.src); return { page: orig, kind: 'original' as const, src: s.src, state: s } }
    return { page: duplicateLeaf(lib, doc, orig.node, aliases), kind: 'duplicate' as const, src: s.src, state: s }
  })
  for (const p of pages) if (p.kind !== 'original' || p.state.annos.length > 0) ownResources(lib, ctx, p.page.node)
  if (!same) {
    const rootRef = doc.catalog.get(N(lib, 'Pages')) as PDFRef
    const root = doc.catalog.Pages()
    root.set(N(lib, 'Kids'), ctx.obj(pages.map((p) => p.page.ref)))
    root.set(N(lib, 'Count'), lib.PDFNumber.of(pages.length))
    for (const p of pages) p.page.node.set(N(lib, 'Parent'), rootRef)
  }
  return { pages, deleted, restructured: !same, aliases }
}

// ---------- destinations ----------
interface Dests { named: Map<string, PDFObject>; deleted: Set<string> }
const nameKey = (lib: Lib, o: PDFObject | undefined): string | undefined => (o instanceof lib.PDFName ? o.decodeText() : o instanceof lib.PDFString || o instanceof lib.PDFHexString ? o.decodeText() : undefined)

function collectNamed(lib: Lib, ctx: PDFContext, catalog: PDFDict): Map<string, PDFObject> {
  const named = new Map<string, PDFObject>()
  const old = catalog.lookupMaybe(N(lib, 'Dests'), lib.PDFDict)
  if (old) for (const [k, v] of old.entries()) named.set(k.decodeText(), v)
  const walk = (node: PDFDict | undefined, depth: number): void => {
    if (!node || depth > 12) return
    const names = node.lookupMaybe(N(lib, 'Names'), lib.PDFArray)
    if (names) for (let i = 0; i + 1 < names.size(); i += 2) { const k = nameKey(lib, names.lookup(i)); if (k !== undefined) named.set(k, names.get(i + 1)) }
    const kids = node.lookupMaybe(N(lib, 'Kids'), lib.PDFArray)
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookupMaybe(i, lib.PDFDict), depth + 1)
  }
  const names = catalog.lookupMaybe(N(lib, 'Names'), lib.PDFDict)
  walk(names?.lookupMaybe(N(lib, 'Dests'), lib.PDFDict), 0)
  void ctx
  return named
}
/** the explicit destination array of a destination value (an array, a name looked up, or a dictionary with /D) */
function destArray(lib: Lib, ctx: PDFContext, d: Dests, v: PDFObject | undefined): PDFArray | undefined {
  let o = v === undefined ? undefined : ctx.lookup(v)
  for (let hops = 0; hops < 4 && o; hops++) {
    if (o instanceof lib.PDFArray) return o
    if (o instanceof lib.PDFDict) { o = look(ctx, o.get(N(lib, 'D'))); continue }
    const k = nameKey(lib, o); if (k === undefined) return undefined
    const n = d.named.get(k); o = n === undefined ? undefined : ctx.lookup(n)
  }
  return undefined
}
/** the destination (or GoTo action) of a link / outline entry points at a deleted page */
function pointsAtDeleted(lib: Lib, ctx: PDFContext, d: Dests, holder: PDFDict): boolean {
  const check = (v: PDFObject | undefined): boolean => { const arr = destArray(lib, ctx, d, v); const f = arr?.get(0); return f instanceof lib.PDFRef && d.deleted.has(tagOf(f)) }
  if (check(holder.get(N(lib, 'Dest')))) return true
  const act = holder.lookupMaybe(N(lib, 'A'), lib.PDFDict)
  if (act) { const s = act.lookup(N(lib, 'S')); if (s instanceof lib.PDFName && s.decodeText() === 'GoTo' && check(act.get(N(lib, 'D')))) return true }
  return false
}

function pruneOutline(lib: Lib, ctx: PDFContext, d: Dests, catalog: PDFDict): void {
  const root = catalog.lookupMaybe(N(lib, 'Outlines'), lib.PDFDict)
  if (!root) return
  const kidsOf = (node: PDFDict): PDFDict[] => { const out: PDFDict[] = []; let cur = node.lookupMaybe(N(lib, 'First'), lib.PDFDict); for (let n = 0; cur && n < 20000; n++) { out.push(cur); cur = cur.lookupMaybe(N(lib, 'Next'), lib.PDFDict) } return out }
    /** returns the number of visible descendants after pruning, relinks the kept children */
  const walk = (node: PDFDict, nodeRef: PDFRef | undefined): number => {
    const kids = kidsOf(node)
    const keptRefs: { ref: PDFRef; dict: PDFDict }[] = []
    const first = node.get(N(lib, 'First'))
    // references of the children in order: First, then each /Next
    const refs: PDFRef[] = []; let r = first
    for (let n = 0; r instanceof lib.PDFRef && n < 20000; n++) { refs.push(r); const dd = ctx.lookup(r); r = dd instanceof lib.PDFDict ? dd.get(N(lib, 'Next')) : undefined }
    let visible = 0
    kids.forEach((kid, i) => {
      const ref = refs[i]!
      const sub = walk(kid, ref)
      const dead = pointsAtDeleted(lib, ctx, d, kid)
      if (dead && sub === 0 && kidsOf(kid).length === 0) return // an entry whose page is gone and that has nothing under it: dropped
      if (dead) { kid.delete(N(lib, 'Dest')); kid.delete(N(lib, 'A')) } // a heading that still has entries under it stays, without a target
      keptRefs.push({ ref, dict: kid })
      const cnt = kid.lookup(N(lib, 'Count'))
      const open = cnt instanceof lib.PDFNumber ? cnt.asNumber() > 0 : false
      visible += 1 + (open ? sub : 0)
    })
    void nodeRef; void first
    keptRefs.forEach((k, i) => {
      if (i > 0) k.dict.set(N(lib, 'Prev'), keptRefs[i - 1]!.ref); else k.dict.delete(N(lib, 'Prev'))
      if (i < keptRefs.length - 1) k.dict.set(N(lib, 'Next'), keptRefs[i + 1]!.ref); else k.dict.delete(N(lib, 'Next'))
    })
    if (keptRefs.length) { node.set(N(lib, 'First'), keptRefs[0]!.ref); node.set(N(lib, 'Last'), keptRefs.at(-1)!.ref) } else { node.delete(N(lib, 'First')); node.delete(N(lib, 'Last')) }
    // Count: positive = open (counts visible descendants), negative = closed (counts what would show if opened)
    const total = keptRefs.reduce((s, k) => s + 1 + countAll(k.dict), 0)
    const c = node.lookup(N(lib, 'Count'))
    if (keptRefs.length === 0) node.delete(N(lib, 'Count'))
    else if (node !== root) node.set(N(lib, 'Count'), lib.PDFNumber.of(c instanceof lib.PDFNumber && c.asNumber() < 0 ? -total : total)); else node.set(N(lib, 'Count'), lib.PDFNumber.of(visible))
    return visible
  }
  const countAll = (node: PDFDict): number => { const c = node.lookup(N(lib, 'Count')); return c instanceof lib.PDFNumber ? Math.abs(c.asNumber()) : 0 }
  walk(root, undefined)
}

function pruneNamed(lib: Lib, ctx: PDFContext, d: Dests, catalog: PDFDict): void {
  const dead = (v: PDFObject | undefined): boolean => { const arr = destArray(lib, ctx, d, v); const f = arr?.get(0); return f instanceof lib.PDFRef && d.deleted.has(tagOf(f)) }
  const old = catalog.lookupMaybe(N(lib, 'Dests'), lib.PDFDict)
  if (old) for (const [k, v] of old.entries()) if (dead(v)) old.delete(k)
  const walk = (node: PDFDict | undefined, depth: number): void => {
    if (!node || depth > 12) return
    const names = node.lookupMaybe(N(lib, 'Names'), lib.PDFArray)
    if (names) {
      const keep: PDFObject[] = []
      for (let i = 0; i + 1 < names.size(); i += 2) if (!dead(names.get(i + 1))) keep.push(names.get(i), names.get(i + 1))
      node.set(N(lib, 'Names'), ctx.obj(keep))
    }
    const kids = node.lookupMaybe(N(lib, 'Kids'), lib.PDFArray)
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookupMaybe(i, lib.PDFDict), depth + 1)
  }
  walk(catalog.lookupMaybe(N(lib, 'Names'), lib.PDFDict)?.lookupMaybe(N(lib, 'Dests'), lib.PDFDict), 0)
}

function pruneLinks(lib: Lib, ctx: PDFContext, d: Dests, plan: Plan): void {
  for (const p of plan.pages) {
    const annots = p.page.node.Annots()
    if (!annots) continue
    for (let j = annots.size() - 1; j >= 0; j--) {
      const a = annots.lookupMaybe(j, lib.PDFDict)
      if (a && pointsAtDeleted(lib, ctx, d, a)) annots.remove(j)
    }
  }
}

/** form fields whose every widget sat on a deleted page are removed from the form */
function pruneForm(lib: Lib, ctx: PDFContext, plan: Plan, origPageOf: Map<string, string>, catalog: PDFDict): void {
  const form = catalog.lookupMaybe(N(lib, 'AcroForm'), lib.PDFDict)
  const fields = form?.lookupMaybe(N(lib, 'Fields'), lib.PDFArray)
  if (!form || !fields) return
  const widgetDead = (ref: PDFRef, w: PDFDict): boolean => {
    const p = w.get(N(lib, 'P'))
    const page = p instanceof lib.PDFRef ? tagOf(p) : origPageOf.get(tagOf(ref))
    return page !== undefined && plan.deleted.has(page)
  }
  /** true when the node (a field, a widget, or a merged field+widget) has nothing left */
  const prune = (arr: PDFArray, depth: number): void => {
    for (let i = arr.size() - 1; i >= 0; i--) {
      const ref = arr.get(i), node = arr.lookupMaybe(i, lib.PDFDict)
      if (!node || !(ref instanceof lib.PDFRef) || depth > 16) continue
      const kids = node.lookupMaybe(N(lib, 'Kids'), lib.PDFArray)
      if (kids) { prune(kids, depth + 1); if (kids.size() === 0) arr.remove(i) } else if (widgetDead(ref, node)) arr.remove(i)
    }
  }
  prune(fields, 0)
}


// ---------- tagged structure ----------
/**
 * The tagged structure (accessibility tree) after pages were deleted: elements whose content sat on a deleted page are removed, kept pages keep their tags.
 * Integer MCIDs and marked-content / object references are tied to a page (the element's /Pg, or the nearest ancestor's), so they go with it; an element left
 * with nothing under it goes too; a reference to a deleted page is removed from the elements that stay; the parent tree (page -> its elements) loses the
 * deleted pages. Returns how many elements were removed. Anything unusual (a loop, an unreadable node) is left alone, and the safety net in `finishDocument`
 * then drops the whole tree rather than keep a pointer into a deleted page.
 */
export function pruneStructure(lib: Lib, ctx: PDFContext, catalog: PDFDict, deleted: Set<string>): number {
  const root = look<PDFDict>(ctx, catalog.get(N(lib, 'StructTreeRoot')))
  if (!(root instanceof lib.PDFDict)) return 0
  const removed = new Set<string>()
  const dead = (pg: PDFObject | undefined): boolean => pg instanceof lib.PDFRef && deleted.has(tagOf(pg))
  let steps = 0
  /** a kid is kept? `parentPg` = the page the enclosing element works on (undefined: none stated) */
  const keep = (kid: PDFObject, parentPg: PDFObject | undefined, depth: number): boolean => {
    if (++steps > 200000 || depth > 64) return true // leave anything strange as it is
    if (kid instanceof lib.PDFNumber) return !dead(parentPg)
    const ref = kid instanceof lib.PDFRef ? kid : undefined
    const d = look<PDFDict>(ctx, kid)
    if (!(d instanceof lib.PDFDict)) return true
    const type = d.lookup(N(lib, 'Type')), tname = type instanceof lib.PDFName ? type.decodeText() : 'StructElem'
    const ownPg = d.get(N(lib, 'Pg'))
    const pg = ownPg ?? parentPg
    if (tname === 'MCR' || tname === 'OBJR') return !dead(pg)
    // a structure element: filter its kids
    const k = d.get(N(lib, 'K'))
    const kids: PDFObject[] = k === undefined ? [] : (look<PDFObject>(ctx, k) instanceof lib.PDFArray ? (look<PDFArray>(ctx, k) as PDFArray).asArray() : [k])
    const kept = kids.filter((c) => keep(c, pg, depth + 1))
    if (kept.length !== kids.length) {
      if (kept.length === 0) d.delete(N(lib, 'K'))
      else d.set(N(lib, 'K'), kept.length === 1 && !(look<PDFObject>(ctx, k!) instanceof lib.PDFArray) ? kept[0]! : ctx.obj(kept))
    }
    if (dead(ownPg)) d.delete(N(lib, 'Pg')) // what is left under it names its own page; this one is gone
    if (kept.length === 0 && (kids.length > 0 || dead(ownPg))) { if (ref) removed.add(tagOf(ref)); return false }
    return true
  }
  const k = root.get(N(lib, 'K'))
  const top = k === undefined ? [] : (look<PDFObject>(ctx, k) instanceof lib.PDFArray ? (look<PDFArray>(ctx, k) as PDFArray).asArray() : [k])
  const kept = top.filter((c) => keep(c, undefined, 0))
  if (kept.length !== top.length) { if (kept.length === 0) root.delete(N(lib, 'K')); else root.set(N(lib, 'K'), kept.length === 1 && !(look<PDFObject>(ctx, k!) instanceof lib.PDFArray) ? kept[0]! : ctx.obj(kept)) }
  if (kept.length === 0) { catalog.delete(N(lib, 'StructTreeRoot')); catalog.delete(N(lib, 'MarkInfo')); return removed.size }
  root.delete(N(lib, 'IDTree')) // an id -> element map would still point at removed elements
  // parent tree: leaves of the number tree, minus what belonged to deleted pages
  const pt = look<PDFDict>(ctx, root.get(N(lib, 'ParentTree')))
  if (pt instanceof lib.PDFDict) {
    const nums: PDFObject[] = []
    const gather = (node: PDFDict, depth: number): void => {
      if (depth > 12) return
      const n = node.lookupMaybe(N(lib, 'Nums'), lib.PDFArray)
      if (n) for (let i = 0; i + 1 < n.size(); i += 2) {
        const key = n.get(i)!, raw = n.get(i + 1)!, val = ctx.lookup(raw)
        const alive = (o: PDFObject | undefined): boolean => o instanceof lib.PDFRef ? !removed.has(tagOf(o)) : o !== undefined
        if (val instanceof lib.PDFArray) {
          const items = val.asArray()
          if (!items.some((x) => alive(x) && x !== lib.PDFNull)) continue
          nums.push(key, ctx.obj(items.map((x) => (alive(x) ? x : lib.PDFNull))))
        } else if (alive(raw)) nums.push(key, raw)
      }
      const kids = node.lookupMaybe(N(lib, 'Kids'), lib.PDFArray)
      if (kids) for (let i = 0; i < kids.size(); i++) { const c = kids.lookupMaybe(i, lib.PDFDict); if (c) gather(c, depth + 1) }
    }
    gather(pt, 0)
    const next = pt.get(N(lib, 'ParentTreeNextKey'))
    void next
    root.set(N(lib, 'ParentTree'), ctx.obj({ Nums: nums }))
  }
  return removed.size
}

// ---------- page labels ----------
interface LabelRange { start: number; dict: PDFDict }
function readLabels(lib: Lib, catalog: PDFDict): LabelRange[] | null {
  const root = catalog.lookupMaybe(N(lib, 'PageLabels'), lib.PDFDict)
  if (!root) return null
  const out: LabelRange[] = []
  const walk = (node: PDFDict | undefined, depth: number): void => {
    if (!node || depth > 12) return
    const nums = node.lookupMaybe(N(lib, 'Nums'), lib.PDFArray)
    if (nums) for (let i = 0; i + 1 < nums.size(); i += 2) { const k = nums.lookup(i), v = nums.lookupMaybe(i + 1, lib.PDFDict); if (k instanceof lib.PDFNumber && v) out.push({ start: k.asNumber(), dict: v }) }
    const kids = node.lookupMaybe(N(lib, 'Kids'), lib.PDFArray)
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookupMaybe(i, lib.PDFDict), depth + 1)
  }
  walk(root, 0)
  return out.sort((a, b) => a.start - b.start)
}
/** page labels follow their pages: the numbering of a moved or deleted page is rewritten as ranges over the new order */
function remapLabels(lib: Lib, ctx: PDFContext, catalog: PDFDict, plan: Plan, oldLabels: LabelRange[] | null): void {
  if (!oldLabels || !oldLabels.length) return
  const rangeOf = (src: number): LabelRange | undefined => { let r: LabelRange | undefined; for (const x of oldLabels) if (x.start <= src) r = x; return r }
  const entry = (r: LabelRange | undefined, src: number | null): PDFObject => {
    if (r && src !== null) {
      const st = r.dict.lookup(N(lib, 'St')); const base = st instanceof lib.PDFNumber ? st.asNumber() : 1
      const o: Record<string, PDFObject | number | string> = {}
      const s = r.dict.get(N(lib, 'S')), p = r.dict.get(N(lib, 'P'))
      if (s) o.S = s
      if (p) o.P = p
      if (s) o.St = base + (src - r.start)
      return ctx.obj(o as never)
    }
    return ctx.obj({ P: lib.PDFHexString.fromText('') })
  }
  const nums: PDFObject[] = []
  let prev: { range: LabelRange | undefined; src: number | null } | null = null
  plan.pages.forEach((p, i) => {
    const src = p.kind === 'blank' ? null : p.src
    const range = src === null ? undefined : rangeOf(src)
    const continues = prev && src !== null && prev.src !== null && p.kind === 'original' && prev.src === src - 1 && prev.range === range
    if (!continues) { nums.push(lib.PDFNumber.of(i), entry(range, src)) }
    prev = p.kind === 'original' ? { range, src } : { range: undefined, src: null }
  })
  catalog.set(N(lib, 'PageLabels'), ctx.obj({ Nums: nums }))
}

// ---------- garbage collection ----------
function reach(lib: Lib, ctx: PDFContext, roots: (PDFObject | undefined)[]): Set<string> {
  const seen = new Set<string>(), stack: PDFObject[] = roots.filter((x): x is PDFObject => x !== undefined)
  while (stack.length) {
    const o = stack.pop()!
    if (o instanceof lib.PDFRef) {
      const t = tagOf(o); if (seen.has(t)) continue
      seen.add(t); const v = ctx.lookup(o); if (v) stack.push(v)
    } else if (o instanceof lib.PDFDict) { for (const v of o.values()) stack.push(v) }
    else if (o instanceof lib.PDFArray) { for (const v of o.asArray()) stack.push(v) }
    else { const sd = (o as unknown as { dict?: PDFDict }).dict; if (sd instanceof lib.PDFDict) stack.push(sd) }
  }
  return seen
}
function collect(lib: Lib, doc: PDFDocument): number {
  const ctx = doc.context, t = ctx.trailerInfo
  const seen = reach(lib, ctx, [t.Root, t.Info])
  let removed = 0
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(tagOf(ref))) { ctx.delete(ref); removed++ }
  return removed
}

export interface Fidelity { objectsRemoved: number; droppedCatalogKeys: string[] }

/** after the page tree is rewritten: re-point / drop everything that referred to pages, then remove what nothing refers to any more */
export function finishDocument(lib: Lib, doc: PDFDocument, plan: Plan, oldLabels: LabelRange[] | null, origPageOf: Map<string, string>): Fidelity {
  const ctx = doc.context, catalog = doc.catalog
  const dests: Dests = { named: collectNamed(lib, ctx, catalog), deleted: plan.deleted }
  if (plan.deleted.size > 0) {
    pruneOutline(lib, ctx, dests, catalog)
    pruneNamed(lib, ctx, dests, catalog)
    pruneLinks(lib, ctx, dests, plan)
    pruneForm(lib, ctx, plan, origPageOf, catalog)
    pruneStructure(lib, ctx, catalog, plan.deleted)
    const open = catalog.get(N(lib, 'OpenAction'))
    if (open) { const holder = look<PDFObject>(ctx, open); const arr = holder instanceof lib.PDFArray ? holder : undefined; const f = arr?.get(0); if ((f instanceof lib.PDFRef && plan.deleted.has(tagOf(f))) || (holder instanceof lib.PDFDict && pointsAtDeleted(lib, ctx, dests, holder))) catalog.delete(N(lib, 'OpenAction')) }
  }
  if (plan.restructured) remapLabels(lib, ctx, catalog, plan, oldLabels)
  let objectsRemoved = collect(lib, doc)
  const dropped: string[] = []
  if (plan.deleted.size > 0) {
    // safety net: anything else that still reaches a deleted page (tagged structure, threads, …) is dropped, so a deleted page is really gone
    const stillThere = (): boolean => { const s = reach(lib, ctx, [ctx.trailerInfo.Root]); for (const d of plan.deleted) if (s.has(d)) return true; return false }
    if (stillThere()) {
      for (const [k, v] of catalog.entries()) {
        const name = k.decodeText()
        if (name === 'Type' || name === 'Pages') continue
        const s = reach(lib, ctx, [v])
        let hit = false; for (const d of plan.deleted) if (s.has(d)) { hit = true; break }
        if (hit) { catalog.delete(k); dropped.push(name); if (name === 'StructTreeRoot') catalog.delete(N(lib, 'MarkInfo')) }
      }
      objectsRemoved += collect(lib, doc)
    }
  }
  return { objectsRemoved, droppedCatalogKeys: dropped }
}

/** page object tag -> original page tag, for form widgets that have no /P entry (looked up by which page lists them) */
export function widgetPages(lib: Lib, doc: PDFDocument): Map<string, string> {
  const m = new Map<string, string>()
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) { const r = annots.get(i); if (r instanceof lib.PDFRef) m.set(tagOf(r), tagOf(page.ref)) }
  }
  return m
}
export { readLabels }
export type { LabelRange }

// ---------- pictures only deleted pages used ----------
/** names of the XObjects a content stream draws (`/Im3 Do`), or null when it cannot be read */
function usedNames(lib: Lib, ctx: PDFContext, streams: PDFObject[]): Set<string> | null {
  const names = new Set<string>()
  const dec = new TextDecoder('latin1')
  for (const s of streams) {
    const st = ctx.lookup(s)
    let text: string
    try {
      if (st instanceof lib.PDFRawStream) text = dec.decode(lib.decodePDFRawStream(st).decode())
      else if (st && typeof (st as { getUnencodedContents?: () => Uint8Array }).getUnencodedContents === 'function') text = dec.decode((st as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents()) // a stream pdf-lib made itself (the q / Q wrappers)
      else return null
    } catch { return null }
    for (const m of text.matchAll(/\/([^\s/<>[\]()%]+)\s+Do(?![A-Za-z])/g)) names.add(m[1]!.replace(/#([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))))
  }
  return names
}
function pageStreams(lib: Lib, ctx: PDFContext, leaf: PDFPageLeaf): PDFObject[] {
  const c = leaf.get(N(lib, 'Contents')), v = c === undefined ? undefined : ctx.lookup(c)
  return v instanceof lib.PDFArray ? v.asArray() : c ? [c] : []
}

/**
 * Producers like jsPDF list EVERY picture of the document in the resources that all pages share. After pages are deleted, the pictures only those pages drew
 * would stay reachable through that list (a deleted slide's photo would still be in the file). Each kept page gets its own XObject list with only the
 * pictures and forms its content draws (form XObjects are followed). A page whose content cannot be read keeps its list.
 */
export function pruneUnusedXObjects(lib: Lib, doc: PDFDocument, plan: Plan): number {
  if (plan.deleted.size === 0) return 0
  const ctx = doc.context
  let pruned = 0
  const cache = new Map<string, Set<string> | null>()
  const formUses = (ref: PDFRef, depth: number): Set<string> | null => {
    const key = tagOf(ref); if (cache.has(key)) return cache.get(key)!
    cache.set(key, new Set())
    const f = ctx.lookup(ref)
    let out: Set<string> | null = new Set()
    const sub = f instanceof lib.PDFRawStream ? f.dict.lookup(N(lib, 'Subtype')) : undefined
    if (f instanceof lib.PDFRawStream && sub instanceof lib.PDFName && sub.decodeText() === 'Form' && depth < 8 && !f.dict.has(N(lib, 'Resources'))) out = usedNames(lib, ctx, [ref]) // a form without resources of its own draws with the page's
    cache.set(key, out); return out
  }
  const done = new Set<PDFPageLeaf>()
  for (const p of plan.pages) {
    const leaf = p.page.node
    if (done.has(leaf) || p.kind === 'blank') continue
    done.add(leaf)
    const res = look<PDFDict>(ctx, leaf.get(N(lib, 'Resources')))
    const xo = res instanceof lib.PDFDict ? look<PDFDict>(ctx, res.get(N(lib, 'XObject'))) : undefined
    if (!(res instanceof lib.PDFDict) || !(xo instanceof lib.PDFDict) || xo.keys().length === 0) continue
    const used = usedNames(lib, ctx, pageStreams(lib, ctx, leaf))
    if (!used) continue
    const keep = new Set(used)
    for (const k of used) { const v = xo.get(N(lib, k)); if (v instanceof lib.PDFRef) { const u = formUses(v, 0); if (u === null) { keep.clear(); break } u.forEach((x) => keep.add(x)) } }
    if (keep.size === 0 && used.size > 0) continue
    const all = xo.keys().map((k) => k.decodeText())
    if (all.every((k) => keep.has(k))) continue
    const own = ctx.obj({})
    for (const [k, v] of xo.entries()) if (keep.has(k.decodeText())) own.set(k, v)
    const r2 = res.clone(ctx); r2.set(N(lib, 'XObject'), own)
    leaf.set(N(lib, 'Resources'), r2)
    pruned += all.length - own.keys().length
  }
  return pruned
}

/**
 * A saved copy cannot carry the original digital signatures: its bytes are different, so every signature would read "invalid" in a PDF viewer (and Acrobat would
 * say the document was changed after signing). The signatures' values are removed (the signature fields stay, empty, and can be signed again) together with the
 * certification entry (/Perms) and the signed-file flags. Returns how many signatures were removed.
 */
export function stripSignatures(lib: Lib, doc: PDFDocument): number {
  const ctx = doc.context, catalog = doc.catalog
  const form = catalog.lookupMaybe(N(lib, 'AcroForm'), lib.PDFDict)
  let removed = 0
  const walk = (arr: PDFArray | undefined, depth: number): void => {
    if (!arr || depth > 16) return
    for (let i = 0; i < arr.size(); i++) {
      const f = arr.lookupMaybe(i, lib.PDFDict); if (!f) continue
      const ft = inherited(lib, ctx, f, 'FT')
      if (ft instanceof lib.PDFName && ft.decodeText() === 'Sig' && f.get(N(lib, 'V')) !== undefined) { f.delete(N(lib, 'V')); removed++ }
      walk(f.lookupMaybe(N(lib, 'Kids'), lib.PDFArray), depth + 1)
    }
  }
  walk(form?.lookupMaybe(N(lib, 'Fields'), lib.PDFArray), 0)
  // a signature that is not reachable through the form (an orphan widget) is found on the pages
  for (const page of doc.getPages()) {
    const annots = page.node.Annots(); if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookupMaybe(i, lib.PDFDict); if (!a) continue
      const ft = a.lookup(N(lib, 'FT'))
      if (ft instanceof lib.PDFName && ft.decodeText() === 'Sig' && a.get(N(lib, 'V')) !== undefined) { a.delete(N(lib, 'V')); removed++ }
    }
  }
  if (removed > 0 || catalog.get(N(lib, 'Perms')) !== undefined) { catalog.delete(N(lib, 'Perms')); form?.delete(N(lib, 'SigFlags')) }
  return removed
}
