/**
 * "Restore unsaved edits": the editing state is kept in this browser's IndexedDB while the visitor edits, so an accidental reload or a crashed tab does not lose
 * the work. LOCAL ONLY (nothing is sent anywhere), visible (the editor says so and offers to clear it), bounded (nothing above LIMIT_MB is kept, entries older
 * than 24 hours are dropped), cleared when the file is downloaded or the visitor discards it. The password of a protected file is never stored (the original,
 * still protected, bytes are kept and the password is asked for again on restore). Every call fails soft: storage that is blocked or full just means no autosave.
 */
import type { Anno, Doc, PageState } from './model'

const DB = 'slidesdone-pdf-editor', STORE = 'session', VERSION = 1
export const LIMIT_MB = 60
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** a document with its picture URLs turned into Blobs (object URLs do not survive a reload) */
export interface PackedDoc { pages: PageState[]; form?: Doc['form'] }
export interface SessionMeta { name: string; size: number; savedAt: number; pages: number; edits: number }
export interface Session extends SessionMeta { file: Uint8Array; doc: PackedDoc }

const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'))
  const r = indexedDB.open(DB, VERSION)
  r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error ?? new Error('indexedDB failed'))
  r.onblocked = () => rej(new Error('indexedDB blocked'))
})
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const db = await open()
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const t = db.transaction(STORE, mode), req = f(t.objectStore(STORE))
      t.oncomplete = () => res(req ? (req.result as T) : undefined)
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error ?? new Error('aborted'))
    })
  } finally { db.close() }
}

/** annotations with the screen-only picture URLs left out (object URLs do not survive a reload, and the page's CSP does not allow fetching them back): they are made again from the bytes on restore */
export function packDoc(doc: Doc): PackedDoc {
  const pages: PageState[] = doc.pages.map((p) => ({
    ...p,
    annos: p.annos.map((a) => {
      if (a.kind !== 'image') return a
      const c: Record<string, unknown> = { ...a, url: '' }
      if (a.src) c.src = { ...a.src, url: '' }
      return c as unknown as Anno
    }),
  }))
  return { pages, ...(doc.form ? { form: doc.form } : {}) }
}
/** what the screen draws for a picture: the bytes as they are, or, with a soft mask (rounded corners), the picture with its see-through plane applied as a PNG */
async function screenUrl(bytes: Uint8Array, mime: string, alpha?: { w: number; h: number; data: Uint8Array }): Promise<string> {
  if (!alpha) return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  const c = document.createElement('canvas'); c.width = alpha.w; c.height = alpha.h
  const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, alpha.w, alpha.h); bmp.close()
  const px = g.getImageData(0, 0, alpha.w, alpha.h)
  for (let i = 0; i < alpha.w * alpha.h; i++) px.data[i * 4 + 3] = alpha.data[i]!
  g.putImageData(px, 0, 0)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png')); c.width = 0
  if (!blob) throw new Error('picture')
  return URL.createObjectURL(blob)
}
/** the inverse: the pictures' URLs are made again (the caller keeps them with the document) */
export async function unpackDoc(p: PackedDoc): Promise<Doc> {
  const pages: PageState[] = []
  for (const pg of p.pages) {
    const annos: Anno[] = []
    for (const a of pg.annos) {
      if (a.kind !== 'image') { annos.push(a); continue }
      const c: Record<string, unknown> = { ...a }
      c.url = await screenUrl(a.bytes, a.mime, a.alpha)
      if (a.src) c.src = { ...a.src, url: await screenUrl(a.src.bytes, a.src.mime) }
      annos.push(c as unknown as Anno)
    }
    pages.push({ ...pg, annos })
  }
  return { pages, ...(p.form ? { form: p.form } : {}) }
}

/** bytes the annotations hold (pictures), for the size limit */
export function docBytes(doc: Doc): number {
  let n = 0
  for (const p of doc.pages) for (const a of p.annos) { if (a.kind === 'image') n += a.bytes.length + (a.src?.bytes.length ?? 0); if (a.kind === 'whiteout' && a.patch) n += a.patch.bytes.length }
  return n
}

let fileKey = ''
/**
 * Write the state, and the file's bytes the first time for this file (the bytes are big and do not change; the state is small). Returns false when nothing
 * was kept (too big, or storage blocked / full): the editor carries on without autosave.
 */
export async function saveSession(name: string, size: number, fileBytes: () => Promise<Uint8Array>, doc: Doc, edits: number): Promise<boolean> {
  try {
    if ((size + docBytes(doc)) / 1048576 > LIMIT_MB) return false
    const key = `${name}:${size}`
    const packed = packDoc(doc)
    if (fileKey !== key) { const bytes = await fileBytes(); await tx('readwrite', (s) => s.put(bytes, 'file')); fileKey = key }
    const meta: SessionMeta = { name, size, savedAt: Date.now(), pages: doc.pages.length, edits }
    await tx('readwrite', (s) => s.put({ meta, doc: packed }, 'state'))
    return true
  } catch { fileKey = ''; return false }
}

/** what is stored, without the bytes (to offer the restore); entries older than a day are removed */
export async function peekSession(): Promise<SessionMeta | null> {
  try {
    const st = await tx<{ meta: SessionMeta } | undefined>('readonly', (s) => s.get('state') as IDBRequest<{ meta: SessionMeta } | undefined>)
    if (!st?.meta) return null
    if (Date.now() - st.meta.savedAt > MAX_AGE_MS) { await clearSession(); return null }
    return st.meta
  } catch { return null }
}
export async function loadSession(): Promise<Session | null> {
  try {
    const st = await tx<{ meta: SessionMeta; doc: PackedDoc } | undefined>('readonly', (s) => s.get('state') as IDBRequest<{ meta: SessionMeta; doc: PackedDoc } | undefined>)
    const file = await tx<Uint8Array | undefined>('readonly', (s) => s.get('file') as IDBRequest<Uint8Array | undefined>)
    return st && file ? { ...st.meta, file, doc: st.doc } : null
  } catch { return null }
}
export async function clearSession(): Promise<void> {
  fileKey = ''
  try { await tx('readwrite', (s) => s.clear()) } catch { /* nothing stored or storage blocked */ }
}
