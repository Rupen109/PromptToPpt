/**
 * List behaviour inside the inline text editor. The editor is a contentEditable box whose children are ONE <div> PER PARAGRAPH; a paragraph that is a list item carries
 * `data-list="bullet" | "number"` (CSS draws the marker, so the marker is never part of the text). These helpers keep that structure, so Enter makes the next bullet,
 * Enter on an empty bullet leaves the list, Backspace at the start of a bullet turns it into plain text, "- " / "1. " start a list, and the box can be read back as paragraphs.
 */
export type ListKind = 'bullet' | 'number'
export interface EditedParagraph { text: string; list?: ListKind }

const kindOf = (el: HTMLElement): ListKind | undefined => (el.dataset['list'] === 'bullet' || el.dataset['list'] === 'number' ? el.dataset['list'] : undefined)
const selection = () => (typeof window === 'undefined' ? null : window.getSelection())

/** Every top-level child of the editor is a paragraph <div>: loose text, <br>s and inline elements the browser leaves behind are wrapped. */
export function normalizeRoot(root: HTMLElement): void {
  for (const n of Array.from(root.childNodes)) {
    if (n instanceof HTMLDivElement) continue
    const wrap = document.createElement('div')
    root.replaceChild(wrap, n)
    wrap.appendChild(n)
  }
  if (!root.firstChild) { const d = document.createElement('div'); d.appendChild(document.createElement('br')); root.appendChild(d) }
}

/** The paragraph <div> that contains a node. */
export function blockOf(root: HTMLElement, node: Node | null): HTMLElement | null {
  let n: Node | null = node
  while (n && n.parentNode !== root) n = n.parentNode
  return n instanceof HTMLElement ? n : null
}

const fixEmpty = (el: HTMLElement) => { if (!(el.textContent ?? '').length && !el.querySelector('br')) el.appendChild(document.createElement('br')) }

function caretTo(node: Node, offset = 0) {
  const r = document.createRange()
  r.setStart(node, offset)
  r.collapse(true)
  const s = selection()
  s?.removeAllRanges()
  s?.addRange(r)
}

/** The paragraphs as typed (a line break inside one becomes a new paragraph with the same list kind; empty paragraphs are dropped unless that leaves nothing). */
export function readParagraphs(root: HTMLElement): EditedParagraph[] {
  const out: EditedParagraph[] = []
  const push = (text: string, list?: ListKind) => {
    for (const line of text.replace(/\r/g, '').replace(/ /g, ' ').split('\n')) out.push({ text: line.trimEnd(), ...(list ? { list } : {}) })
  }
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) { if (n.textContent) push(n.textContent); continue }
    if (!(n instanceof HTMLElement)) continue
    push((n.innerText ?? n.textContent ?? '').replace(/\n$/, ''), kindOf(n))
  }
  const kept = out.filter((p) => p.text.length > 0)
  return kept.length ? kept : [{ text: '', ...(out[0]?.list ? { list: out[0].list } : {}) }]
}

/** Enter: split the paragraph at the caret (the new one keeps the list kind). On an EMPTY list item it leaves the list instead (like a word processor). */
export function splitParagraph(root: HTMLElement): void {
  normalizeRoot(root)
  const sel = selection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const block = blockOf(root, range.startContainer) ?? (root.lastElementChild as HTMLElement | null)
  if (!block) return
  if (!(block.textContent ?? '').length && kindOf(block)) { delete block.dataset['list']; fixEmpty(block); caretTo(block, 0); return }
  const tail = document.createRange()
  tail.setStart(range.startContainer, range.startOffset)
  tail.setEnd(block, block.childNodes.length)
  const next = block.cloneNode(false) as HTMLElement
  next.appendChild(tail.extractContents())
  fixEmpty(block); fixEmpty(next)
  block.after(next)
  caretTo(next, 0)
}

/** Backspace at the very start of a list item turns it into plain text (the next Backspace then joins it to the line above). Returns true when it handled the key. */
export function backspaceAtListStart(root: HTMLElement): boolean {
  const sel = selection()
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  const block = blockOf(root, range.startContainer)
  if (!block || !kindOf(block)) return false
  const before = document.createRange()
  before.setStart(block, 0)
  before.setEnd(range.startContainer, range.startOffset)
  if (before.toString().length > 0) return false
  delete block.dataset['list']
  return true
}

/** The paragraphs the selection touches. */
function selectedBlocks(root: HTMLElement): HTMLElement[] {
  const sel = selection()
  if (!sel || !sel.rangeCount) return []
  const r = sel.getRangeAt(0)
  const a = blockOf(root, r.startContainer), b = blockOf(root, r.endContainer)
  if (!a || !b) return []
  const all = Array.from(root.children) as HTMLElement[]
  const i = all.indexOf(a), j = all.indexOf(b)
  return all.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** Ctrl/Cmd+Shift+8 (bullets) and +7 (numbers): turn the selected paragraphs into that list, or back into plain text when they all already are. */
export function toggleList(root: HTMLElement, kind: ListKind): void {
  normalizeRoot(root)
  const blocks = selectedBlocks(root)
  if (!blocks.length) return
  const allSame = blocks.every((b) => kindOf(b) === kind)
  for (const b of blocks) { if (allSame) delete b.dataset['list']; else b.dataset['list'] = kind }
}

/** "- text", "* text", "• text" or "1. text" at the start of a plain paragraph starts a list (the marker characters are removed from the text). */
export function applyListShortcut(root: HTMLElement): boolean {
  const sel = selection()
  if (!sel || !sel.rangeCount) return false
  const block = blockOf(root, sel.getRangeAt(0).startContainer)
  if (!block || kindOf(block)) return false
  const text = block.textContent ?? ''
  const m = /^(?:([-*•])|(\d{1,2})[.)])[\s ]/.exec(text)
  if (!m) return false
  block.dataset['list'] = m[1] ? 'bullet' : 'number'
  const node = (() => { const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); return w.nextNode() as Text | null })()
  if (node) { node.data = node.data.slice(m[0].length); caretTo(node, 0) }
  fixEmpty(block)
  return true
}

/** Plain text pasted in (no foreign formatting), one paragraph per line. */
export function pastePlain(root: HTMLElement, text: string): void {
  const lines = text.replace(/\r/g, '').split('\n')
  document.execCommand('insertText', false, lines[0] ?? '')
  for (const line of lines.slice(1)) { splitParagraph(root); document.execCommand('insertText', false, line) }
}
