import { decodeXml } from '../sources/zip.ts'
import { SourceError } from '../sources/errors.ts'

/**
 * A small XML reader for Office parts. It is linear-time (no backtracking regular expressions), refuses DOCTYPE / ENTITY declarations outright (so an
 * XML-entity bomb or external entity can never be expanded: the only entities decoded are the five standard ones and numeric references), never fetches
 * anything, and is bounded in nodes and depth. Element names lose their namespace prefix (`a:off` -> `off`); attribute names keep theirs (`r:embed`).
 */
export interface XNode { n: string; a: Record<string, string>; c: XNode[]; t: string }

export const XML_LIMITS = { maxNodes: 400_000, maxDepth: 120 }

export function parseXml(xml: string, budget = { nodes: 0 }): XNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml.slice(0, 4096)) || xml.includes('<!ENTITY')) throw new SourceError('That file contains unsafe XML and was not read')
  const root: XNode = { n: '#root', a: {}, c: [], t: '' }
  const stack: XNode[] = [root]
  const len = xml.length
  let i = 0
  while (i < len) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) { stack[stack.length - 1]!.t += decodeXml(xml.slice(i)); break }
    if (lt > i) { const txt = xml.slice(i, lt); if (txt.trim() || stack.length > 1) stack[stack.length - 1]!.t += decodeXml(txt) }
    if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt + 4); i = e < 0 ? len : e + 3; continue }
    if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt + 9); const end = e < 0 ? len : e; stack[stack.length - 1]!.t += xml.slice(lt + 9, end); i = e < 0 ? len : e + 3; continue }
    if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt + 2); i = e < 0 ? len : e + 2; continue }
    if (xml.startsWith('<!', lt)) { const e = xml.indexOf('>', lt + 2); i = e < 0 ? len : e + 1; continue }
    if (xml[lt + 1] === '/') { const e = xml.indexOf('>', lt + 2); if (stack.length > 1) stack.pop(); i = e < 0 ? len : e + 1; continue }
    // an opening tag: name, attributes, optional "/"
    let j = lt + 1
    while (j < len && !' \t\r\n/>'.includes(xml[j]!)) j++
    const rawName = xml.slice(lt + 1, j)
    const node: XNode = { n: rawName.slice(rawName.indexOf(':') + 1), a: {}, c: [], t: '' }
    let selfClose = false
    for (;;) {
      while (j < len && ' \t\r\n'.includes(xml[j]!)) j++
      if (j >= len) break
      if (xml[j] === '>') { j++; break }
      if (xml[j] === '/') { selfClose = true; j++; continue }
      let k = j
      while (k < len && !'= \t\r\n/>'.includes(xml[k]!)) k++
      const name = xml.slice(j, k)
      while (k < len && ' \t\r\n'.includes(xml[k]!)) k++
      if (xml[k] !== '=') { j = k + 1; continue } // a bare word: not valid XML, skip it
      k++
      while (k < len && ' \t\r\n'.includes(xml[k]!)) k++
      const q = xml[k]
      if (q !== '"' && q !== "'") { j = k + 1; continue }
      const e = xml.indexOf(q, k + 1)
      if (e < 0) { j = len; break }
      node.a[name] = decodeXml(xml.slice(k + 1, e))
      j = e + 1
    }
    if (++budget.nodes > XML_LIMITS.maxNodes) throw new SourceError('That file is too large or complex to read')
    stack[stack.length - 1]!.c.push(node)
    if (!selfClose) { stack.push(node); if (stack.length > XML_LIMITS.maxDepth) throw new SourceError('That file is too deeply nested to read') }
    i = j
  }
  return root
}

export const kids = (n: XNode | undefined, name: string): XNode[] => (n ? n.c.filter((c) => c.n === name) : [])
export const kid = (n: XNode | undefined, name: string): XNode | undefined => (n ? n.c.find((c) => c.n === name) : undefined)
/** follows a `/`-separated path of child names */
export const at = (n: XNode | undefined, path: string): XNode | undefined => { let cur = n; for (const p of path.split('/')) { cur = kid(cur, p); if (!cur) return undefined } return cur }
/** all descendants with this name (document order), without descending into a match */
export function findAll(n: XNode | undefined, name: string, acc: XNode[] = []): XNode[] {
  if (!n) return acc
  for (const c of n.c) { if (c.n === name) acc.push(c); else findAll(c, name, acc) }
  return acc
}
export const num = (v: string | undefined, d = 0): number => { if (v === undefined) return d; const x = Number(v); return Number.isFinite(x) ? x : d }
