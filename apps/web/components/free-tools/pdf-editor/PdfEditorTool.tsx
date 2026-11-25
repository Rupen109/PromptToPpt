'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ScanText, ShieldCheck, TriangleAlert } from '@prompttoppt/ui/icons'
import { Card } from '@/components/ui/Card'
import { clampZoom, fitWidthZoom, screenToPageDelta, turnedBounds } from '@/lib/pdf-editor/geometry'
import { fitIntoBox, loadImageFile, type Loaded } from '@/lib/pdf-editor/images'
import {
  addAnno, addBlankPage, cancelKey, commit, deletePage, duplicatePage, findAnno, insertAnnos, movePage, movePageBy, newDoc, newHistory, patchAnno, replaceAnno, pageSize, redo, removeAnno, rotatePage, seal, setField, shownSize, uid, undo,
  type Anno, type Box, type Doc, type History, type ImageAnno, type PageState, type WhiteoutAnno,
} from '@/lib/pdf-editor/model'
import { MAX_PAGES, OpenCancelled, PdfConvertError, extractRuns, openForEditing, type PasswordAsk, type Run } from '@/lib/pdf-editor/render'
import { groupRuns, isMixedWeight, joinSameLine, runCovered } from '@/lib/pdf-editor/blocks'
import { BASELINE, charStyles, hasRtl, retext, rightEdge, toggleRange } from '@/lib/pdf-editor/text'
import { ensureFont } from '@/lib/pdf-editor/fonts'
import { readFields, type FieldValue, type FormField } from '@/lib/pdf-editor/forms'
import { DEFAULTS, TOOL_HINT, type Defaults, type Tool } from '@/lib/pdf-editor/tools'
import { OCR_DOWNLOAD_MB, OCR_LANGUAGES, defaultOcrLanguage, languageOf } from '@/lib/pdf-editor/ocr-info'
import type { Pic } from '@/lib/pdf-editor/pictures'
import type { SessionMeta } from '@/lib/pdf-editor/autosave'
import { PageView, type PicCover, type Sample } from './PageView'
import { PropertiesBar } from './PropertiesBar'
import { SignDialog } from './SignDialog'
import { ThumbRail } from './ThumbRail'
import { BulletAsk } from './BulletAsk'
import { PasswordDialog } from './PasswordDialog'
import { SaveOptions } from './SaveOptions'
import { useThumbs } from './use-thumbs'
import { Toolbar } from './Toolbar'

const MAX_MB = 30
/** a scan with many pages: this many (plus the page on screen) are read by themselves, the rest when opened */
const AUTO_READ_PAGES = 12
const OCR_STAGE_TEXT = { engine: 'Starting the text finder…', model: 'Loading the reading model…', read: 'Reading the page…', again: 'Looking again with the colours flipped…', regions: 'Looking at labels, numbers and small lines…' } as const
const LANG_KEY = 'pdf-editor-ocr-language'
const NONE: Run[] = []
const NO_PAGES: PageState[] = []
type MarkerCover = NonNullable<Sample['marker']>
const NO_PICS: Pic[] = []
/** the saved file's name: the opened name without .pdf plus "-edited", with path separators, control and reserved characters made harmless (a name like ../x or a:b*c must never reach the file system as it is) */
export const downloadName = (name: string): string => {
  const base = name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s_]+|[.\s]+$/g, '').slice(0, 120)
  return `${base || 'document'}-edited.pdf`
}
const isField = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)

/** Free PDF editor. Everything runs in the browser: pdf.js draws the pages, pdf-lib writes the result. The file is never uploaded. */
/** the fields of a text item that change how it is laid out (a change to any of them is laid out again by retext) */
const TEXT_LAYOUT = ['text', 'size', 'wrap', 'spans', 'bold', 'italic', 'fam', 'pitch'] as const

export function PdfEditorTool() {
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /** full screen: the browser's own full screen when it exists, else the editor covers the window (iPhone Safari has no element full screen) */
  const [apiFull, setApiFull] = useState(false)
  const [coverFull, setCoverFull] = useState(false)
  const full = apiFull || coverFull
  useEffect(() => {
    const f = () => setApiFull(document.fullscreenElement !== null && document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  useEffect(() => {
    if (!coverFull) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [coverFull])
  async function toggleFull() {
    if (apiFull) { await document.exitFullscreen().catch(() => undefined); return }
    if (coverFull) { setCoverFull(false); return }
    const el = rootRef.current
    if (el && typeof el.requestFullscreen === 'function') {
      try { await el.requestFullscreen(); return } catch { /* refused: use the window-cover way */ }
    }
    setCoverFull(true)
  }

  const [file, setFile] = useState<File | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [h, setH] = useState<History | null>(null)
  const [pageId, setPageId] = useState('')
  const [tool, setTool] = useState<Tool>('editText')
  const [defaults, setDefaults] = useState<Defaults>(DEFAULTS)
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [manualZoom, setManualZoom] = useState(1)
  const [fit, setFit] = useState(true)
  const [avail, setAvail] = useState(800)
  const [pwAsk, setPwAsk] = useState<{ name: string; wrong: boolean } | null>(null)
  const pwResolve = useRef<((pw: string | null) => void) | null>(null)
  const passwordRef = useRef<string | undefined>(undefined)
  const fileRef = useRef<File | null>(null)
  /** the opened file is protected: it was opened with a password, or it only restricts changes. The saved copy has neither. */
  const [protection, setProtection] = useState<'password' | 'restricted' | null>(null)
  const [understood, setUnderstood] = useState(false)
  /** digital signatures in the opened file (found by a raw scan when it opens) and whether the visitor accepted that the saved copy loses them */
  const [signed, setSigned] = useState(0)
  /** a stored copy of unsaved edits from an earlier visit (reload, crash): offered on the start screen. `kept`: this session's edits are being kept on this device (shown, with a way to clear it). */
  const [stored, setStored] = useState<SessionMeta | null>(null)
  const [kept, setKept] = useState(false)
  const [signedAck, setSignedAck] = useState(false)
  const [flatten, setFlatten] = useState(false)
  const [fieldsBySrc, setFieldsBySrc] = useState<Record<number, FormField[]>>({})
  const [selRange, setSelRange] = useState<{ id: string; start: number; end: number } | null>(null)
  const [bulletAsk, setBulletAsk] = useState<{ pageId: string; marker: MarkerCover } | null>(null)
  /** the list symbol in front of each text that replaced a bullet's words (to cover it when the visitor chooses so) */
  const bullets = useRef(new Map<string, MarkerCover>())
  const docRef = useRef<Doc | null>(null)
  const [runsBySrc, setRunsBySrc] = useState<Record<number, Run[]>>({})
  const [ocrBySrc, setOcrBySrc] = useState<Record<number, Run[]>>({})
  const [ocr, setOcr] = useState<{ src: number; stage: keyof typeof OCR_STAGE_TEXT; fraction: number } | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  /** language of the text in picture pages (the reading model that is loaded); starts from the visitor's last choice, else the site / document language, else English */
  const [ocrLang, setOcrLang] = useState(() => { if (typeof window === 'undefined') return 'eng'; try { const v = window.localStorage.getItem(LANG_KEY); if (v && OCR_LANGUAGES.some((l) => l.code === v)) return v } catch { /* storage blocked */ } return defaultOcrLanguage(document.documentElement.lang) })
  const ocrLangRef = useRef(ocrLang)
  /** pages where the visitor pressed Cancel or the reading failed: no automatic retry there */
  const [ocrOff, setOcrOff] = useState<Record<number, boolean>>({})
  /** the visitor pressed Cancel: nothing is read by itself any more (on any page) until they ask for it again with the Find the text button or choose another language */
  const [ocrStopped, setOcrStopped] = useState(false)
  const [nudge, setNudge] = useState(0)
  const [lineByLine, setLineByLine] = useState(false)
  const [pickBox, setPickBox] = useState(false)
  /** the text just picked mixes bold and regular words: shown as a note while it is selected */
  const [mixed, setMixed] = useState<{ id: string; bold: boolean } | null>(null)
  const ocrJob = useRef<{ cancel: () => void } | null>(null)
  const imageInput2 = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const picRun = useRef(false)
  const [picsBySrc, setPicsBySrc] = useState<Record<number, Pic[]>>({})
  const [picTick, setPicTick] = useState(0)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [signing, setSigning] = useState(false)
  const [railOpen, setRailOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768) // collapsed on phones, where the page needs the room

  const doc: Doc | null = h?.present ?? null
  useEffect(() => { docRef.current = doc })
  const thumbs = useThumbs(pdf, doc?.pages ?? NO_PAGES)
  const page = doc ? doc.pages.find((p) => p.id === pageId) ?? doc.pages[0] : undefined
  const selected = page && sel ? findAnno(doc!, page.id, sel) : undefined
  const edits = h?.past.length ?? 0

  /** run a change on the document; changes with the same key back to back are one undo step */
  const change = useCallback((f: (d: Doc) => Doc, key: string | null = null) => setH((cur) => (cur ? commit(cur, f(cur.present), key) : cur)), [])

  // ---- opening a file ----
  async function open(f: File | undefined, restore?: Doc) {
    if (!f) return
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return setError('Please choose a PDF file.')
    if (edits > 0 && !window.confirm('Open another PDF? Your changes to this one will be lost.')) return
    setError(null); setLoading(true)
    // a password-protected file asks for its password in a dialog (a wrong one asks again; Cancel goes back to the start)
    const ask: PasswordAsk = (reason) => new Promise<string | null>((resolve) => { pwResolve.current = resolve; setPwAsk({ name: f.name, wrong: reason === 'wrong' }) })
    try {
      const { pdf: next, pages, password } = await openForEditing(f, ask)
      setPdf((old) => { void old?.cleanup(); return next })
      // restored edits are only used when they still fit this file (same number of pages, every page points at a page of the file)
      const back = restore && restore.pages.length > 0 && restore.pages.every((p) => p.src === null || p.src < pages.length) ? restore : null
      setFile(f); fileRef.current = f; setH(newHistory(back ?? newDoc(pages))); setPageId((back ?? newDoc(pages)).pages[0]!.id); setSel(null); setEditing(null); setTool('editText'); setFit(true)
      setRunsBySrc({}); setPicsBySrc({}); setOcrBySrc({}); setOcrError(null); setOcrOff({}); setOcrStopped(false); cancelOcr(false)
      setFieldsBySrc({}); setFlatten(false); setUnderstood(false); setSigned(0); setSignedAck(false); setBulletAsk(null); bullets.current.clear()
      passwordRef.current = password; setProtection(password !== undefined ? 'password' : null)
      void (async () => { // what the bytes say: restrictions without a password (owner password only), digital signatures
        try {
          const bytes = new Uint8Array(await f.arrayBuffer())
          if (password === undefined) { const { isProtected } = await import('@/lib/pdf-editor/decrypt'); if (await isProtected(bytes) && fileRef.current === f) setProtection('restricted') }
          const { inspectFile } = await import('@/lib/pdf-editor/docinfo'); const info = inspectFile(bytes)
          if (fileRef.current === f && info.signed > 0) { setSigned(info.signed); setStatus(`Opened ${f.name}. This PDF is digitally signed: editing and saving makes the signature invalid. Tick the box above before you download.`) }
        } catch { /* unknown: saving says so if it matters */ }
      })()
      setStatus(`Opened ${f.name}, ${pages.length} page${pages.length === 1 ? '' : 's'}${password !== undefined ? '. The saved copy will have no password' : ''}.`)
    } catch (e) {
      if (e instanceof OpenCancelled) { setStatus('Opening cancelled.'); return }
      console.error('pdf editor open failed', e)
      setError(e instanceof PdfConvertError ? e.message : 'Could not open that PDF. It may be damaged.')
    } finally { setLoading(false); setPwAsk(null); pwResolve.current = null }
  }

  const onField = (name: string, value: FieldValue) => change((d) => setField(d, name, value), `form:${name}`)


  // ---- autosave of the editing state (this device only; see lib/pdf-editor/autosave.ts) ----
  useEffect(() => {
    let dead = false
    void import('@/lib/pdf-editor/autosave').then((m) => m.peekSession()).then((m) => { if (!dead) setStored(m) }).catch(() => undefined)
    return () => { dead = true }
  }, [])
  useEffect(() => {
    if (!file || !doc || edits === 0) return
    const t = setTimeout(() => {
      void import('@/lib/pdf-editor/autosave').then((m) => m.saveSession(file.name, file.size, async () => new Uint8Array(await file.arrayBuffer()), doc, edits)).then((ok) => setKept(ok)).catch(() => setKept(false))
    }, 1500)
    return () => clearTimeout(t)
  }, [file, doc, edits])
  async function restoreStored() {
    const m = await import('@/lib/pdf-editor/autosave')
    const s = await m.loadSession()
    if (!s) { setStored(null); setError('The saved edits could not be read any more.'); return }
    await open(new File([s.file as BlobPart], s.name, { type: 'application/pdf' }), await m.unpackDoc(s.doc))
    setStored(null)
  }
  async function discardStored() { const m = await import('@/lib/pdf-editor/autosave'); await m.clearSession(); setStored(null); setKept(false); setStatus('The saved copy on this device was deleted.') }

  // ---- text runs (found once per original page, for every page, the one on screen first) ----
  const runSrc = tool === 'editText' && page && page.src !== null ? page.src : null
  const haveRuns = runSrc !== null && runsBySrc[runSrc] !== undefined
  /** original pages in reading order: the page on screen first, then the others */
  const readOrder = useMemo(() => {
    if (!doc) return []
    const seen = new Set<number>(); const all: { src: number; geom: PageState['geom'] }[] = []
    for (const p of doc.pages) if (p.src !== null && !seen.has(p.src)) { seen.add(p.src); all.push({ src: p.src, geom: p.geom }) }
    const cur = page?.src ?? null
    return cur === null ? all : [...all.filter((x) => x.src === cur), ...all.filter((x) => x.src !== cur)]
  }, [doc, page?.src])
  const orderRef = useRef(readOrder)
  useEffect(() => { orderRef.current = readOrder }) // declared before the effects that read it, so it is current when they run
  const orderKey = readOrder.map((x) => x.src).join(',')
  // ---- form fields (read for every original page, the one on screen first; a file with none shows no form options) ----
  useEffect(() => {
    if (!pdf) return
    const x = orderRef.current.find((o) => fieldsBySrc[o.src] === undefined)
    if (!x) return
    let dead = false
    readFields(pdf, x.src, x.geom).then((f) => { if (!dead) setFieldsBySrc((c) => ({ ...c, [x.src]: f })) }).catch(() => { if (!dead) setFieldsBySrc((c) => ({ ...c, [x.src]: [] })) })
    return () => { dead = true }
  }, [pdf, fieldsBySrc, orderKey])
  const hasForm = Object.values(fieldsBySrc).some((f) => f.length > 0)
  useEffect(() => {
    if (!pdf) return
    const x = orderRef.current.find((o) => runsBySrc[o.src] === undefined)
    if (!x) return
    let dead = false
    extractRuns(pdf, x.src, x.geom).then((r) => { if (!dead) setRunsBySrc((c) => ({ ...c, [x.src]: r })) }).catch(() => { if (!dead) setRunsBySrc((c) => ({ ...c, [x.src]: [] })) })
    return () => { dead = true }
  }, [pdf, runsBySrc, orderKey])
  const textRuns = (runSrc !== null ? runsBySrc[runSrc] : undefined) ?? NONE
  const ocrRuns = runSrc !== null ? ocrBySrc[runSrc] : undefined
  const lineRuns = ocrRuns ?? textRuns
  /** what can be clicked: paragraphs (lines that belong together), or single lines when the visitor asks for that */
  const runs = useMemo(() => (lineByLine ? lineRuns : groupRuns(lineRuns, !ocrRuns)), [lineRuns, lineByLine, ocrRuns])
  const shownRuns = page ? runs.filter((r) => !runCovered(page.annos, r)).length : 0
  /** a page with no text in the file: the picture-page help (find the text, or drag a box) is shown */
  const pictureNote = tool === 'editText' && haveRuns && textRuns.length === 0 && runSrc !== null
  const ocrBusy = ocr !== null && ocr.src === runSrc

  // ---- reading the text of picture pages (OCR, in the browser; tesseract.js is loaded the first time a picture page needs it) ----
  function cancelOcr(byVisitor = true) {
    if (byVisitor && ocr) { setOcrOff((c) => ({ ...c, [ocr.src]: true })); setOcrStopped(true) } // pressed Cancel: do not start again by itself, on that page or any other
    ocrJob.current?.cancel(); ocrJob.current = null; setOcr(null)
  }
  async function readPage(src: number, geom: PageState['geom']) {
    if (!pdf || ocrJob.current) return
    const lang = ocrLangRef.current
    setOcrError(null); setOcr({ src, stage: 'engine', fraction: 0.01 })
    try {
      const { ocrPage } = await import('@/lib/pdf-editor/ocr')
      const job = ocrPage(pdf, src, pageSize(geom), lang, (p) => setOcr({ src, stage: p.stage, fraction: p.fraction }))
      ocrJob.current = job
      const found = joinSameLine(await job.done)
      setOcrBySrc((c) => ({ ...c, [src]: found }))
      const n = job.notes
      const extra = `${n.curved ? ` ${n.curved} curved text area${n.curved === 1 ? ' was' : 's were'} not read (curves cannot be read reliably): drag a box over ${n.curved === 1 ? 'it' : 'them'} to change ${n.curved === 1 ? 'it' : 'them'}.` : ''}${n.partial ? ' Reading stopped at the time limit, so some small text may be missing: drag a box over anything that is not clickable.' : ''}`
      if (src === page?.src) setStatus(found.length ? `Found ${found.length} line${found.length === 1 ? '' : 's'} of text. Click one to change it.${extra}` : `No text was found in this picture. Drag a box over the words instead.${extra}`)
    } catch (e) {
      const name = (e as { name?: string }).name
      if (name === 'OcrModelUnavailable') {
        setOcrOff((c) => ({ ...c, [src]: true }))
        setOcrError(`The ${languageOf(lang).name} reading model could not be loaded (you may be offline, or this site does not carry it). Choose another language, or try again. You can still drag a box over the words you want to change.`)
      } else if (name !== 'OcrCancelled') {
        console.error('pdf editor ocr failed', e)
        setOcrOff((c) => ({ ...c, [src]: true }))
        setOcrError('The text finder could not run in this browser. You can still drag a box over the words you want to change.')
      }
    } finally { ocrJob.current = null; setOcr(null) }
  }
  /** the Retry button after a Cancel */
  function findText() {
    if (!page || page.src === null) return
    setOcrError(null); setOcrStopped(false); setOcrOff((c) => ({ ...c, [page.src!]: false }))
  }
  /** another language: what was read is read again (in the new language) for every picture page; edits already made stay */
  function changeOcrLang(code: string) {
    if (code === ocrLang) return
    ocrLangRef.current = code
    try { window.localStorage.setItem(LANG_KEY, code) } catch { /* storage blocked: the choice just is not remembered */ }
    cancelOcr(false); setOcrLang(code); setOcrBySrc({}); setOcrOff({}); setOcrStopped(false); setOcrError(null)
    setStatus(`Reading picture pages in ${languageOf(code).name}.`)
  }
  // a page with no text in the file is read as soon as it is known (the one on screen first, then the others, one at a time); nothing is uploaded
  // The queue is polite: it waits while the tab is hidden (nothing starts in a background tab, the page being read finishes) and carries on when the visitor comes back;
  // and in a long scan only the page on screen and the first AUTO_READ_PAGES pages are read by themselves, the others when the visitor opens them.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const f = () => setVisible(document.visibilityState !== 'hidden')
    f(); document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  useEffect(() => {
    if (!pdf || ocr || ocrJob.current || !visible || ocrStopped) return
    const next = orderRef.current.find((o, i) => runsBySrc[o.src]?.length === 0 && ocrBySrc[o.src] === undefined && !ocrOff[o.src] && (o.src === page?.src || i < AUTO_READ_PAGES))
    if (next) void readPage(next.src, next.geom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, runsBySrc, ocrBySrc, ocr, ocrOff, orderKey, visible, page?.src, ocrStopped])
  useEffect(() => () => { ocrJob.current?.cancel(); ocrJob.current = null }, [])

  // ---- pictures (found once per original page, after its text is known: real images from the file, or photos found in a picture page; one page at a time, the one on screen first) ----
  useEffect(() => { pdfRef.current = pdf }, [pdf])
  useEffect(() => {
    if (!pdf || picRun.current) return
    const x = orderRef.current.find((o) => picsBySrc[o.src] === undefined && runsBySrc[o.src] !== undefined && (runsBySrc[o.src]!.length > 0 || ocrBySrc[o.src] !== undefined || ocrOff[o.src]))
    if (!x) return
    picRun.current = true
    const forPdf = pdf, textRead = runsBySrc[x.src]!.length > 0 || ocrBySrc[x.src] !== undefined
    void (async () => {
      try {
        const { detectPictures } = await import('@/lib/pdf-editor/pictures')
        const text = (ocrBySrc[x.src] ?? runsBySrc[x.src] ?? []).map((r) => turnedBounds(r.box, r.box.rot))
        const found = await detectPictures(forPdf, x.src, x.geom, { text, strict: !textRead })
        if (pdfRef.current === forPdf) setPicsBySrc((c) => ({ ...c, [x.src]: found }))
      } catch (e) {
        console.error('pdf editor picture search failed', e)
        if (pdfRef.current === forPdf) setPicsBySrc((c) => ({ ...c, [x.src]: [] }))
      } finally { picRun.current = false; setPicTick((t) => t + 1) }
    })()
  }, [pdf, runsBySrc, ocrBySrc, ocrOff, picsBySrc, orderKey, picTick])
  const pics = (runSrc !== null ? picsBySrc[runSrc] : undefined) ?? NO_PICS
  const picsKnown = runSrc !== null && picsBySrc[runSrc] !== undefined
  const shownPics = page ? pics.filter((q) => !page.annos.some((a) => a.kind === 'whiteout' && a.x <= q.box.x + 1 && a.y <= q.box.y + 1 && a.x + a.w >= q.box.x + q.box.w - 1 && a.y + a.h >= q.box.y + q.box.h - 1)).length : 0

  // ---- zoom ----
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el); setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [pdf])
  const shownW = page ? shownSize(page).w : 600
  const zoom = fit ? fitWidthZoom(avail - 40, shownW, 2.5) : manualZoom
  const zoomBy = (d: number) => { setManualZoom(clampZoom(zoom + d)); setFit(false) }

  // ---- warn before closing with unsaved edits ----
  useEffect(() => {
    if (edits === 0) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [edits])

  // ---- selection / editing ----
  const finishEditing = useCallback((id: string | null, pid: string) => {
    if (!id) return
    setEditing(null)
    const was = docRef.current && findAnno(docRef.current, pid, id)
    if (was?.kind === 'text' && was.replaces && !was.text.trim()) { const m = bullets.current.get(id); if (m) setBulletAsk({ pageId: pid, marker: m }) } // the words were deleted: offer to remove the bullet too
    setH((cur) => {
      if (!cur) return cur
      const a = findAnno(cur.present, pid, id)
      if (!a || a.kind !== 'text' || a.text.trim()) return seal(cur)
      // words of the page that the visitor emptied: the words are gone, the cover stays (that is how text is deleted)
      if (a.replaces) return commit(seal(cur), removeAnno(cur.present, pid, id))
      const c = cancelKey(cur, `text:${id}`)
      return c !== cur ? c : commit(cur, removeAnno(cur.present, pid, id))
    })
  }, [])
  const select = (id: string | null) => { if (editing && id !== editing && page) finishEditing(editing, page.id); setSel(id) }
  const goPage = (id: string) => { if (editing && page) finishEditing(editing, page.id); setPageId(id); setSel(null) }
  const pickTool = (t: Tool) => { if (editing && page) finishEditing(editing, page.id); setTool(t); setSel(null) }

  function onCreate(annos: Anno[], key: string | null) {
    if (!page) return
    change((d) => addAnno(d, page.id, annos), key)
    const last = annos.at(-1)!
    if (last.kind === 'text' && last.fam !== 'sans' && last.fam !== 'serif' && last.fam !== 'mono') { // a bundled font that was not loaded yet: measure again once it is (not an undo step)
      const pid = page.id, id = last.id
      void ensureFont(last.fam, last.bold, last.italic).then(() => setH((cur) => { const a = cur && findAnno(cur.present, pid, id); return cur && a?.kind === 'text' ? { ...cur, present: replaceAnno(cur.present, pid, id, retext(a, {})) } : cur }))
    }
    if (last.kind === 'path' && last.variant === 'pen') { setStatus('Line drawn.'); return }
    setSel(last.id)
    if (last.kind === 'text') { setEditing(last.id); setTool('editText') }
    setStatus(`Added ${last.kind === 'path' ? last.variant : last.kind === 'shape' ? last.shape : last.kind}.`)
  }
  async function onRunPick(run: Run, sample: Sample) {
    if (!page) return
    const pid = page.id, pg = page
    // the fonts of the text (the bundled ones are fetched once, here) are loaded BEFORE the box is measured, so line breaks match the saved file
    const looks = new Set<string>([`${run.bold}:${run.italic}`]); for (const sp of run.spans ?? []) looks.add(`${sp.bold}:${sp.italic}`)
    await Promise.all([...looks].map((k) => { const [b, i] = k.split(':'); return ensureFont(run.fam, b === 'true', i === 'true') }))
    setBulletAsk(null)
    const pad = 1
    const turned = run.box.rot ? { rot: run.box.rot } : {} // text that is turned on the page: the cover and the new words are turned the same way
    const cover: WhiteoutAnno = { id: uid(), kind: 'whiteout', color: sample.bg, ...(sample.patch ? { patch: sample.patch } : {}), ...turned, x: run.box.x - pad, y: run.box.y, w: run.box.w + pad * 2, h: run.box.h }
    const ink = run.pad ?? 0 // a found box reaches a little past the letters: the new text starts where the letters did
    // where the new words start, in the box's own frame (along the text, and down to the top of the letters); turned text: that offset is turned with the box about its top-left corner
    const th = ((run.box.rot ?? 0) * Math.PI) / 180, dx0 = ink, dy0 = run.box.baseline - BASELINE[run.fam] * run.box.size - run.box.y
    const startX = run.box.x + dx0 * Math.cos(th) - dy0 * Math.sin(th), startY = run.box.y + dx0 * Math.sin(th) + dy0 * Math.cos(th)
    const base = retext({ id: uid(), kind: 'text', x: run.box.rot ? startX : run.box.x + ink, y: run.box.rot ? startY : run.box.baseline - BASELINE[run.fam] * run.box.size, w: 0, h: 0, text: run.str, fam: run.fam, size: run.box.size, bold: run.bold, italic: run.italic, color: sample.text, replaces: true, ...turned, ...(run.box.rot ? {} : { right: rightEdge(pageSize(pg.geom).w, run.box.x) }), ...(run.spans?.length ? { spans: run.spans } : {}) }, {})
    // a paragraph keeps its width and its line spacing; the text wraps inside it
    const text0 = run.parts ? retext(base, { wrap: (run.box.w - 2 * ink) * 1.03, pitch: run.pitch }) : base
    // right-to-left words sit against the RIGHT edge of the found box (the picture of the new text is as wide as its own letters)
    const text = hasRtl(run.str) && !run.box.rot ? { ...text0, x: run.box.x + run.box.w - ink - text0.w } : text0
    if (sample.marker) bullets.current.set(text.id, sample.marker)
    change((d) => addAnno(d, pid, [cover, text]), `text:${text.id}`)
    setSel(text.id); setEditing(text.id); setTool('editText'); setMixed(isMixedWeight(run) ? { id: text.id, bold: run.bold } : null)
    setStatus(run.parts ? `Editing a paragraph of ${run.parts.length} lines. The original is covered; type to replace it, it wraps at the same width.` : 'Editing text. The original is covered; type to replace it.')
  }
  /** Edit text on a picture (a scanned page, a deck saved as images): there are no words in the file to pick, so the visitor drags a box over them; it is covered in the colour around it and a text box in the ink colour waits for the new words */
  function onRegionPick(box: Box, sample: Sample) {
    if (!page) return
    const cover: WhiteoutAnno = { id: uid(), kind: 'whiteout', color: sample.bg, ...(sample.patch ? { patch: sample.patch } : {}), x: box.x, y: box.y, w: box.w, h: box.h }
    const size = Math.max(6, Math.min(72, Math.round(box.h * 0.72)))
    const blank = retext({ id: uid(), kind: 'text', x: box.x, y: box.y, w: 0, h: 0, text: '', fam: defaults.text.fam, size, bold: defaults.text.bold, italic: defaults.text.italic, color: sample.text, right: rightEdge(pageSize(page.geom).w, box.x) }, {})
    const text = { ...blank, y: Math.max(0, box.y + (box.h - blank.h) / 2) }
    change((d) => addAnno(d, page.id, [cover, text]), `text:${text.id}`)
    setSel(text.id); setEditing(text.id); setTool('editText')
    setStatus('The part you boxed is covered. Type the new words; resize the text with its corner handles.')
  }
  // right-to-left words that replace a line read from a picture grow to the left: their right edge stays where the line's was
  const onText = (id: string, text: string) => { if (page) change((d) => { const a = findAnno(d, page.id, id); if (a?.kind !== 'text') return d; const t = retext(a, { text }); return replaceAnno(d, page.id, id, a.replaces && hasRtl(text) ? { ...t, x: a.x + a.w - t.w } : t) }, `text:${id}`) }
  // a change that lays a text item out again (its words, size, wrap width, style, font, or the right edge of right-to-left text) goes through retext and replaces
  // the item whole; a plain move or a non-text item is merged
  const onPatch = (id: string, patch: Partial<Anno>, key: string) => { if (page) change((d) => { const a = findAnno(d, page.id, id); return a?.kind === 'text' && (TEXT_LAYOUT.some((k) => k in patch) || (a.right !== undefined && 'x' in patch)) ? replaceAnno(d, page.id, id, retext(a, patch as never)) : patchAnno(d, page.id, id, patch) }, key) }
  /** a found picture was clicked: cut its pixels out of a sharp render, leave a smooth cover where it was, and let the visitor move / resize / replace / delete the picture like any other */
  async function onPicPick(pic: Pic, cover: PicCover) {
    if (!pdf || !page || page.src === null || picking) return
    const pid = page.id, geom = page.geom, src = page.src
    setPicking(true); setStatus('Picking up the picture…')
    try {
      const { cropPicture } = await import('@/lib/pdf-editor/pictures')
      const c = await cropPicture(pdf, src, geom, pic)
      const coverAnno: WhiteoutAnno = { id: uid(), kind: 'whiteout', color: cover.bg, ...(cover.patch ? { patch: cover.patch } : {}), ...cover.box }
      const image: ImageAnno = { id: uid(), kind: 'image', url: c.url, mime: c.mime, bytes: c.bytes, ...(c.alpha ? { alpha: c.alpha } : {}), ...c.box }
      change((d) => insertAnnos(d, pid, [coverAnno, image], 0))
      setSel(image.id); setEditing(null)
      setStatus('Picture picked up. Drag it, resize it with the corners, replace it or delete it. The place it was in is filled with the background.')
    } catch (e) {
      console.error('pdf editor pick up failed', e)
      setError('Could not pick up that picture. Try again.')
    } finally { setPicking(false) }
  }
  /** Replace picture: the new picture fills the same box (cropped to fit, or whole inside it) */
  async function onReplace(f: File | undefined) {
    if (!f || !page || !selected || selected.kind !== 'image') return
    const target = selected, pid = page.id
    try {
      const loaded = await loadImageFile(f)
      const fit = target.fit ?? 'cover'
      const out = await fitIntoBox(loaded, target.w, target.h, fit)
      change((d) => patchAnno(d, pid, target.id, { url: out.url, mime: out.mime, bytes: out.bytes, alpha: out.alpha, src: { url: loaded.url, mime: loaded.mime, bytes: loaded.bytes, w: loaded.w, h: loaded.h }, fit } as Partial<Anno>), `replace:${uid()}`)
      setError(null); setStatus('Picture replaced. It fills the same box.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not use that picture.') }
  }
  async function onFit(fit: 'cover' | 'contain') {
    if (!page || !selected || selected.kind !== 'image' || !selected.src) return
    const target = selected, pid = page.id, src = selected.src
    try {
      const out = await fitIntoBox(src, target.w, target.h, fit)
      change((d) => patchAnno(d, pid, target.id, { url: out.url, mime: out.mime, bytes: out.bytes, alpha: out.alpha, fit } as Partial<Anno>), `fit:${uid()}`)
      setStatus(fit === 'cover' ? 'The picture now fills the box.' : 'The picture now fits inside the box.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not use that picture.') }
  }
  const removeSelected = () => { if (page && sel) { change((d) => removeAnno(d, page.id, sel)); setSel(null); setEditing(null); setStatus('Item deleted.') } }

  /** style changes: the selected item (if any) and the starting style of that kind of item. Bold / italic with words selected inside the text being typed in change those words only. */
  async function onStyle(patch: Record<string, unknown>) {
    const kind = selected?.kind ?? (tool === 'text' || tool === 'editText' ? 'text' : tool === 'draw' ? 'path' : tool === 'highlight' ? 'highlight' : tool === 'whiteout' ? 'whiteout' : 'shape')
    const variant = selected?.kind === 'path' ? selected.variant : tool === 'draw' ? 'pen' : 'line'
    if (selected?.kind === 'text' && page) {
      const range = editing === selected.id && selRange?.id === selected.id && selRange.end > selRange.start ? selRange : null
      const which = 'bold' in patch ? 'bold' : 'italic' in patch ? 'italic' : null
      const next = range && which ? { ...selected, spans: toggleRange(selected, range.start, range.end, which) } : { ...selected, ...patch }
      // every look the text will use must be loaded before it is measured
      const looks = new Set(charStyles(next.text, next.bold, next.italic, next.spans).map((x) => x))
      await Promise.all([...looks].map((x) => ensureFont(next.fam, !!(x & 1), !!(x & 2))))
      const id = selected.id, pid = page.id
      change((d) => { const a = findAnno(d, pid, id); return a?.kind === 'text' ? replaceAnno(d, pid, id, retext(a, range && which ? { spans: next.spans ?? [] } : (patch as never))) : d }, `style:${id}:${range ? 'range' : Object.keys(patch).join()}`)
      if (range && which) return // a stretch: the starting style for new text stays as it was
    } else if (selected && page) {
      change((d) => patchAnno(d, page.id, selected.id, patch as Partial<Anno>), `style:${selected.id}:${Object.keys(patch).join()}`)
    }
    setDefaults((d) => {
      if (kind === 'text') return { ...d, text: { ...d.text, ...patch } }
      if (kind === 'highlight') return { ...d, highlight: { ...d.highlight, ...patch } }
      if (kind === 'whiteout') return { ...d, whiteout: { ...d.whiteout, ...patch } }
      if (kind === 'path' && variant === 'pen') return { ...d, pen: { ...d.pen, ...patch } }
      const p = patch as { color?: string; stroke?: string; width?: number; fill?: string | null }
      return { ...d, shape: { stroke: p.color ?? p.stroke ?? d.shape.stroke, width: p.width ?? d.shape.width, fill: 'fill' in p ? p.fill ?? null : d.shape.fill } }
    })
    if (kind === 'text' && typeof patch.fam === 'string') void ensureFont(patch.fam as never, false, false) // new text starts in this font: have it ready
  }

  // ---- pictures and signature ----
  function placeImage(img: Loaded, maxWidth: number) {
    if (!page) return
    const { w: pw, h: ph } = pageSize(page.geom)
    const w = Math.min(img.w, maxWidth, pw * 0.8), hgt = (img.h / img.w) * w
    const a: Anno = { id: uid(), kind: 'image', url: img.url, mime: img.mime, bytes: img.bytes, x: (pw - w) / 2, y: Math.max(0, (ph - hgt) / 2), w, h: hgt }
    change((d) => addAnno(d, page.id, a)); setSel(a.id); setTool('editText'); setStatus('Picture added. Drag it where you want it.')
  }
  async function onPicture(f: File | undefined) {
    if (!f) return
    try { placeImage(await loadImageFile(f), 240); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not use that picture.') }
  }

  // ---- page operations ----
  const pageOp = (f: (d: Doc) => { doc: Doc; newId: string }, msg: string) => { if (!h) return; const r = f(h.present); setH(commit(h, r.doc)); setPageId(r.newId); setSel(null); setStatus(msg) }
  function onDeletePage(id: string) {
    if (!h || h.present.pages.length <= 1) return
    const i = h.present.pages.findIndex((p) => p.id === id)
    const next = deletePage(h.present, id)
    setH(commit(h, next)); setPageId(next.pages[Math.min(i, next.pages.length - 1)]!.id); setSel(null); setStatus('Page deleted. Undo brings it back.')
  }

  // ---- download ----
  async function download() {
    if (!file || !doc) return
    if ((protection && !understood) || (signed > 0 && !signedAck)) return
    if (editing && page) finishEditing(editing, page.id)
    setBusy(true); setError(null)
    try {
      const { exportPdf } = await import('@/lib/pdf-editor/export')
      const bytes = await exportPdf(await file.arrayBuffer(), doc.pages, { password: passwordRef.current, form: doc.form, flatten })
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = downloadName(file.name); a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      void import('@/lib/pdf-editor/autosave').then((m) => m.clearSession()).then(() => setKept(false)).catch(() => undefined) // saved: the stored copy of the unsaved edits is not needed any more
      setStatus(protection ? 'Your edited PDF was saved to your downloads. It has no password.' : 'Your edited PDF was saved to your downloads.')
    } catch (e) {
      console.error('pdf editor export failed', e)
      setError(e instanceof Error && e.name === 'ExportError' ? e.message : 'Something went wrong while saving. Try again, or remove the last item you added.')
    } finally { setBusy(false) }
  }

  // ---- keyboard ----
  function onKey(e: RKeyboardEvent<HTMLDivElement>) {
    if (!h || signing) return
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase()
    const inText = e.target instanceof HTMLTextAreaElement
    if (mod && (k === 'z' || k === 'y')) {
      if (isField(e.target)) return
      e.preventDefault(); setEditing(null)
      setH(e.shiftKey || k === 'y' ? redo(h) : undo(h)); setStatus(e.shiftKey || k === 'y' ? 'Redone.' : 'Undone.')
      return
    }
    if (e.key === 'Escape') {
      if (editing) { if (page) finishEditing(editing, page.id); e.currentTarget.focus(); return }
      if (sel) setSel(null); else if (tool !== 'editText') setTool('editText'); else if (coverFull) setCoverFull(false)
      return
    }
    if (inText || isField(e.target) || !page) return
    // Enter, Space, Delete and Backspace belong to a focused control (a toolbar or rail button, a text run, a link): they must act on THAT, not on the selected item
    // (Enter on "Page 2" used to reopen the selected text for typing, and its default action, the click, was cancelled)
    if (e.target instanceof HTMLElement && e.target !== rootRef.current && e.target.closest('button, [role=button], a, summary') && ['Enter', ' ', 'Delete', 'Backspace'].includes(e.key)) return
    if (sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeSelected(); return }
    if (sel && selected?.kind === 'text' && e.key === 'Enter') { e.preventDefault(); setEditing(sel); return }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const v = arrows[e.key]
    if (v && sel && selected && (e.target === rootRef.current || scroller.current?.contains(e.target as Node))) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const [dx, dy] = screenToPageDelta(page.turn, v[0] * step, v[1] * step)
      change((d) => patchAnno(d, page.id, sel, { x: selected.x + dx, y: selected.y + dy }), `nudge:${sel}`)
    }
  }

  // ---- empty state ----
  const dialog = pwAsk ? <PasswordDialog fileName={pwAsk.name} wrong={pwAsk.wrong} onSubmit={(pw) => pwResolve.current?.(pw)} onCancel={() => { pwResolve.current?.(null); pwResolve.current = null; setPwAsk(null) }} /> : null
  if (!pdf || !h || !doc || !page) {
    return (
      <div className="flex flex-col gap-6 text-left">
        {dialog}
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void open(e.dataTransfer.files[0]) }}
            className="w-full rounded-2xl border-2 border-dashed border-foreground bg-[#f8f9fc] px-6 py-12 text-center hover:bg-[#f0f4f8] focus:outline-none focus:ring-2 focus:ring-primary">
            <span className="block font-heading font-extrabold text-lg text-foreground">{loading ? 'Opening your PDF…' : 'Drop your PDF here, or click to choose'}</span>
            <span className="mt-1 block text-sm font-medium text-[#475569]">{`Up to ${MAX_PAGES} pages and ${MAX_MB} MB · edited on your device. Your file is not uploaded.`}</span>
          </button>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a PDF" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
          {stored && (
            <div role="region" aria-label="Unsaved edits found" data-testid="restore-offer" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-foreground bg-[#fffbeb] px-3 py-2 text-sm font-bold text-[#92400e]">
              <span>{`Unsaved edits to “${stored.name}” were kept on this device (${stored.edits} change${stored.edits === 1 ? '' : 's'}, ${new Date(stored.savedAt).toLocaleTimeString()}). They never left your computer.`}</span>
              <button type="button" onClick={() => void restoreStored()} className="rounded-md border-2 border-foreground bg-white px-2.5 py-1 text-xs font-extrabold uppercase text-foreground hover:bg-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Restore edits</button>
              <button type="button" onClick={() => void discardStored()} className="rounded-md border-2 border-foreground bg-white px-2.5 py-1 text-xs font-extrabold uppercase text-foreground hover:bg-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Delete them</button>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
          <p className="mt-5 flex gap-2 text-sm font-medium text-[#475569]"><ShieldCheck aria-hidden size={18} className="mt-0.5 shrink-0 text-primary" />Edit text, add text, whiteout, highlight, draw, add shapes, pictures and your signature, and organise pages. Nothing leaves your device.</p>
        </Card>
      </div>
    )
  }

  const idx = doc.pages.findIndex((p) => p.id === page.id)
  return (
    <div ref={rootRef} className={full ? `flex flex-col gap-2 bg-background p-2 text-left outline-none ${coverFull ? 'fixed inset-0 z-[100]' : 'h-screen w-screen'}` : 'flex flex-col gap-3 text-left outline-none'} onKeyDown={onKey} tabIndex={-1} style={{ outline: 'none' }} data-testid="pdf-editor">
      <div className={`overflow-hidden rounded-2xl border-2 border-foreground bg-white shadow-[4px_5px_0_0_#181b25] ${full ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
        <Toolbar full={full} onFull={() => void toggleFull()} tool={tool} onTool={pickTool} canUndo={h.past.length > 0} canRedo={h.future.length > 0}
          onUndo={() => { setEditing(null); setH(undo(h)); setStatus('Undone.') }} onRedo={() => { setEditing(null); setH(redo(h)); setStatus('Redone.') }}
          zoom={zoom} onZoom={zoomBy} onFit={() => setFit(true)} onPicture={() => imageInput.current?.click()} onSign={() => setSigning(true)}
          onOpenOther={() => fileInput.current?.click()} railOpen={railOpen} onToggleRail={() => setRailOpen((o) => !o)} onDownload={() => void download()} busy={busy} blocked={protection && !understood ? 'Tick the box about the password first' : signed > 0 && !signedAck ? 'Tick the box about the digital signature first' : null} />
        <PropertiesBar tool={tool} selected={selected} defaults={defaults} onStyle={onStyle} onDelete={removeSelected} lineByLine={lineByLine} onLineByLine={setLineByLine} pickBox={pickBox} onPickBox={setPickBox} onReplace={() => imageInput2.current?.click()} onFit={(f) => void onFit(f)} selection={selRange && editing && selRange.id === editing ? { start: selRange.start, end: selRange.end } : null} />
        <SaveOptions protection={protection} understood={understood} onUnderstood={setUnderstood} hasForm={hasForm} flatten={flatten} onFlatten={setFlatten} signed={signed} signedAck={signedAck} onSignedAck={setSignedAck} />
        {/* one zone for the notes that come and go while a picture page is read (note, progress, pictures found): its room is kept once it is needed, so the page below does not jump with every message */}
        <div data-testid="notes-zone" className={pictureNote || shownPics > 0 || ocrBusy ? 'min-h-[9.25rem] sm:min-h-[4.75rem]' : ''}>
        {tool === 'editText' && shownPics > 0 && (
          <p data-testid="pictures-found" data-count={pics.length} data-shown={shownPics} className="border-b-2 border-foreground bg-[#f5f3ff] px-3 py-1.5 text-xs font-bold text-[#4c1d95]">
            Found {pics.length} picture{pics.length === 1 ? '' : 's'}: click one (violet outline) to move, resize, replace or delete it.{pics.some((q) => q.maybe) ? ' A grey dashed “Picture?” is a guess (mostly one flat colour): click it only if it is a picture.' : ''}{picking ? ' Picking it up…' : ''}
          </p>
        )}
        {pictureNote && (
          <div role="region" aria-label="This page is a picture" data-testid="picture-note" key={nudge}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-foreground bg-secondary px-3 py-1.5 text-xs font-bold text-foreground ${nudge ? 'animate-pulse' : ''}`}>
            {ocrBusy ? (
              <div className="flex flex-wrap items-center gap-3" data-testid="ocr-progress">
                <span>Reading this picture page…</span>
                <div role="progressbar" aria-label="Finding the text" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ocr!.fraction * 100)} className="h-2.5 w-40 overflow-hidden rounded-full border-2 border-foreground bg-white">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(ocr!.fraction * 100)}%` }} />
                </div>
                <span className="font-medium">{OCR_STAGE_TEXT[ocr!.stage]} {Math.round(ocr!.fraction * 100)}%</span>
                <button type="button" onClick={() => cancelOcr()} className="rounded-md border-2 border-foreground bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase hover:bg-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Cancel</button>
              </div>
            ) : ocrRuns ? (
              <div className="flex flex-wrap items-center gap-x-3" data-testid="ocr-done">
                <p data-testid="found-count" data-lines={ocrRuns.length} data-shown={shownRuns}>
                  {ocrRuns.length ? `Found ${ocrRuns.length} line${ocrRuns.length === 1 ? '' : 's'} in ${shownRuns} block${shownRuns === 1 ? '' : 's'}: click one to edit.` : 'No text found: drag a box over words to edit them.'}
                  {runs.length > shownRuns ? ` (${runs.length - shownRuns} already changed)` : ''}
                </p>
                <details className="font-medium">
                  <summary className="cursor-pointer font-bold underline">Tips</summary>
                  <p className="mt-1 max-w-[70ch]">
                    A block is a title or bullet; the new text wraps at the same width. {lineByLine ? 'Line by line is on.' : 'Alt-click edits one line.'} Missed something? Drag a box over it. The reading is approximate: check the words before you download. New text uses the closest of Helvetica, Times, Courier or the bundled fonts. Nothing is uploaded.
                  </p>
                </details>
              </div>
            ) : !ocrOff[runSrc!] && !ocrStopped ? (
              <p data-testid="ocr-waiting">Getting ready to read this page…</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span>Reading stopped.</span>
                <button type="button" onClick={() => findText()} data-testid="ocr-start"
                  className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground bg-primary px-2.5 py-1 text-xs font-extrabold text-white shadow-[2px_2px_0_0_#181b25] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                  <ScanText aria-hidden size={14} />Find the text in this picture
                </button>
                <span className="font-medium">About {ocrLang === 'eng' ? OCR_DOWNLOAD_MB : languageOf(ocrLang).mb + 2} MB the first time.</span>
              </div>
            )}
            <label className="ml-auto flex items-center gap-1.5 font-medium" title="The language of the words in the picture. A reading model is downloaded the first time a language is chosen (about 1 to 3 MB) and kept by your browser.">
              Text language
              <select data-testid="ocr-language" aria-label="Language of the text in this picture" value={ocrLang} onChange={(e) => changeOcrLang(e.target.value)}
                className="rounded-md border-2 border-foreground bg-white px-1.5 py-0.5 text-[11px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {OCR_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            {ocrError && <p role="alert" className="w-full text-xs font-bold text-red-700">{ocrError}</p>}
          </div>
        )}
        </div>
        <div className={`flex flex-col md:flex-row ${full ? 'min-h-0 flex-1' : ''}`}>
          {railOpen && (
            <div className={`shrink-0 border-b-2 border-foreground bg-[#f8f9fc] md:w-[148px] md:overflow-y-auto md:border-b-0 md:border-r-2 ${full ? 'md:h-auto' : 'md:h-[72vh]'}`}>
              <ThumbRail pages={doc.pages} currentId={page.id} thumbs={thumbs} onSelect={goPage}
                onRotate={(id, by) => { change((d) => rotatePage(d, id, by)); setStatus(`Page turned ${by > 0 ? 'right' : 'left'}.`) }}
                onDelete={onDeletePage} onMove={(id, d) => { change((x) => movePageBy(x, id, d)); setStatus('Page moved.') }} onMoveTo={(id, i) => { change((x) => movePage(x, id, i)); setStatus('Page moved.') }}
                onDuplicate={(id) => pageOp((d) => duplicatePage(d, id), 'Page duplicated.')} onAddBlank={(id) => pageOp((d) => addBlankPage(d, id), 'Blank page added.')} />
            </div>
          )}
          <div ref={scroller} className={`min-w-0 flex-1 overflow-x-auto overflow-y-scroll bg-[#d9dde6] ${full ? 'h-auto min-h-0' : 'h-[68vh] md:h-[72vh]'}`} data-testid="page-scroll">
            <div className="flex min-h-full w-max min-w-full items-start justify-center p-5">
              <PageView pickBox={pickBox} onRenderError={() => setError('This page could not be drawn. The browser may be out of memory: zoom out, close other tabs, or try a smaller file. Your edits are safe.')} key={page.id} pdf={pdf} page={page} zoom={zoom} tool={tool} style={defaults} selectedId={sel} editingId={editing} runs={runs} pics={pics} onPicPick={(q, c) => void onPicPick(q, c)}
                onSelect={select} onEditing={(id) => { if (id === null && editing && page) finishEditing(editing, page.id); else setEditing(id) }}
                fields={page.src !== null ? fieldsBySrc[page.src] : undefined} form={doc.form} onField={onField} onSelection={(id, st, en) => setSelRange({ id, start: st, end: en })} onCreate={onCreate} onPatch={onPatch} onText={onText} onEditBlur={(id) => finishEditing(id, page.id)} onRunPick={onRunPick} onRegionPick={onRegionPick} onEmptyClick={() => { if (pictureNote && !ocrBusy) { setNudge((n) => n + 1); setStatus('There is no text to click on this page. Use Find the text in this picture, or drag a box over the words.') } }} outlineRuns={!!ocrRuns} onToolDone={() => setTool('editText')} />
            </div>
          </div>
        </div>
        <p className="border-t-2 border-foreground bg-[#f8f9fc] px-3 py-2 text-xs font-medium text-[#475569]">
          <span className="font-bold text-foreground">Page {idx + 1} of {doc.pages.length}.</span> {TOOL_HINT[tool]}
          {kept && <span data-testid="autosave-note" className="ml-2 font-bold text-[#92400e]">Edits are also kept on this device in case this tab closes (removed when you download). <button type="button" onClick={() => void discardStored()} className="underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Delete the copy</button></span>}
        </p>
        {mixed && sel === mixed.id && selected?.kind === 'text' && (
          <p data-testid="mixed-note" className="border-t-2 border-foreground bg-[#fffbeb] px-3 py-1.5 text-xs font-bold text-[#92400e]">
            This line mixes bold and regular words. The new text is all {selected.bold ? 'bold' : 'regular'}; use the Bold button to change that for the whole text.
          </p>
        )}
        {bulletAsk && <BulletAsk onRemove={() => { const m = bulletAsk.marker; change((d) => addAnno(d, bulletAsk.pageId, { id: uid(), kind: 'whiteout', color: m.bg, ...(m.patch ? { patch: m.patch } : {}), ...m.box })); setBulletAsk(null); setStatus('The bullet was removed too. Undo brings it back.') }} onKeep={() => setBulletAsk(null)} />}
        {ocr && ocr.src !== runSrc && (
          <p data-testid="ocr-background" className="border-t-2 border-foreground bg-secondary px-3 py-1.5 text-xs font-bold text-foreground">
            Reading the words of page {doc.pages.findIndex((p) => p.src === ocr.src) + 1} in the background… {Math.round(ocr.fraction * 100)}% <button type="button" onClick={() => cancelOcr()} className="ml-2 underline">Cancel</button>
          </p>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{status}</p>
      <span className="sr-only" data-testid="pictures-state" data-state={picsKnown ? 'done' : 'searching'} data-count={pics.length} />
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      {!full && <p className="flex gap-2 rounded-xl border-2 border-foreground bg-white px-4 py-3 text-xs font-medium leading-5 text-[#475569]">
        <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>Everything stays on your device. Editing text covers the old text and writes new text on top; the old text is still inside the file, so this is <strong>not a secure way to remove private information</strong>. New text uses Helvetica, Times, Courier or one of the bundled fonts (picked to look closest to the page), not the original font file.</span>
      </p>}
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose another PDF" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={imageInput} type="file" accept="image/*" className="sr-only" aria-label="Choose a picture to add" onChange={(e) => { void onPicture(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={imageInput2} type="file" accept="image/*" className="sr-only" aria-label="Choose a replacement picture" onChange={(e) => { void onReplace(e.target.files?.[0]); e.target.value = '' }} />
      {dialog}
      {signing && <SignDialog onClose={() => setSigning(false)} onDone={(img) => { setSigning(false); placeImage(img, 180) }} />}
    </div>
  )
}
