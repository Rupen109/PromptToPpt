import type { Extracted } from './extract.ts'
import { SourceError } from './errors.ts'
import { clean, MAX_TEXT_CHARS } from './limits.ts'

/**
 * Email (.eml, RFC 822 / MIME). Reads the headers that matter, the readable body (plain text preferred over HTML; HTML turned into text without
 * styles, scripts or tracking pixels) and lists attachments by NAME only — attachments themselves are never read or stored. Forwarded emails
 * inside the message are read too (a few levels deep). Outlook .msg is a different binary format and is refused with a hint.
 */
export const EML_MAX_BYTES = 10 * 1024 * 1024
const MAX_DEPTH = 4
const MAX_PARTS = 60

interface Entity { headers: Map<string, string>; body: string }

function parseEntity(raw: string): Entity {
  const m = /\r?\n\r?\n/.exec(raw)
  const head = m ? raw.slice(0, m.index) : raw
  const body = m ? raw.slice(m.index + m[0].length) : ''
  const headers = new Map<string, string>()
  let key = ''
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && key) headers.set(key, `${headers.get(key)} ${line.trim()}`)
    else { const i = line.indexOf(':'); if (i > 0) { key = line.slice(0, i).trim().toLowerCase(); if (!headers.has(key)) headers.set(key, line.slice(i + 1).trim()) } }
  }
  return { headers, body }
}

const textDecoder = (cs: string) => { try { return new TextDecoder(cs.trim().replace(/^["']|["']$/g, '').toLowerCase() || 'utf-8') } catch { return new TextDecoder('utf-8') } }

function qpBytes(s: string, q = false): Buffer {
  const t = (q ? s.replace(/_/g, ' ') : s.replace(/=\r?\n/g, ''))
  const out: number[] = []
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { out.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2 }
    else out.push(...Buffer.from(t[i]!, 'utf8'))
  }
  return Buffer.from(out)
}

/** RFC 2047 "encoded words" in headers: =?UTF-8?B?...?= / =?ISO-8859-1?Q?...?= */
function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_m, cs: string, enc: string, data: string) => textDecoder(cs).decode(enc.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : qpBytes(data, true))).replace(/\?=\s+=\?/g, '')
}

const param = (value: string, name: string) => {
  const star = new RegExp(`${name}\\*=(?:[^']*)'[^']*'([^;]*)`, 'i').exec(value)?.[1]
  if (star) { try { return decodeURIComponent(star) } catch { return star } }
  return new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value)?.slice(1).find((x) => x !== undefined)
}

function bodyBytes(e: Entity): Buffer {
  const enc = (e.headers.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase()
  if (enc === 'base64') return Buffer.from(e.body.replace(/\s+/g, ''), 'base64')
  if (enc === 'quoted-printable') return qpBytes(e.body)
  return Buffer.from(e.body, 'latin1')
}
function bodyText(e: Entity): string {
  const cs = param(e.headers.get('content-type') ?? '', 'charset') ?? 'utf-8'
  return textDecoder(cs).decode(bodyBytes(e))
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', pound: '£', rupee: '₹', bull: '•' }
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<\s*br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => { if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '' } return NAMED[e.toLowerCase()] ?? m })
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
}

interface Collected { texts: string[]; attachments: string[]; parts: number }
function walk(e: Entity, depth: number, out: Collected): void {
  if (++out.parts > MAX_PARTS || depth > MAX_DEPTH) return
  const ct = e.headers.get('content-type') ?? 'text/plain'
  const type = ct.split(';')[0]!.trim().toLowerCase()
  const disp = e.headers.get('content-disposition') ?? ''
  const fname = param(disp, 'filename') ?? param(ct, 'name')
  if (type.startsWith('multipart/')) {
    const boundary = param(ct, 'boundary')
    if (!boundary) { out.texts.push(clean(e.body.slice(0, 2000))); return }
    const segs = e.body.split(new RegExp(`(?:^|\\r?\\n)--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*(?=\\r?\\n|$)`)).slice(1)
    const kids = segs.map((s) => parseEntity(s.replace(/^\r?\n/, ''))).filter((k) => k.headers.size > 0 || k.body.trim())
    if (type === 'multipart/alternative') {
      const sub = (k: Entity): Collected => { const c: Collected = { texts: [], attachments: [], parts: out.parts }; walk(k, depth + 1, c); return c }
      const options = kids.map(sub)
      // the last alternative is the richest, but plain text wins when it has real content (HTML turned into text is noisier)
      const pickIdx = kids.findIndex((k) => /^text\/plain/i.test(k.headers.get('content-type') ?? '') && clean(bodyText(k)).length >= 20)
      const chosen = options[pickIdx >= 0 ? pickIdx : options.length - 1]
      if (chosen) { out.texts.push(...chosen.texts); out.parts = Math.max(out.parts, chosen.parts) }
      for (const o of options) out.attachments.push(...o.attachments)
    } else for (const k of kids) walk(k, depth + 1, out)
    return
  }
  if (type === 'message/rfc822') { const inner = parseEntity(bodyBytes(e).toString('latin1')); out.texts.push(`--- Forwarded message ---\n${headerBlock(inner)}\n\n`); walk(inner, depth + 1, out); return }
  if (/attachment/i.test(disp) || (fname && !type.startsWith('text/'))) { out.attachments.push(decodeWords(unraw(fname ?? type))); return }
  if (type === 'text/plain') { out.texts.push(bodyText(e)); return }
  if (type === 'text/html') { out.texts.push(htmlToText(bodyText(e))); return }
  if (fname) out.attachments.push(decodeWords(fname))
}

/** headers are read byte-for-byte (latin1); a header that holds raw UTF-8 is turned back into text before the encoded words are decoded */
const unraw = (v: string) => { if (!/[\x80-\xff]/.test(v)) return v; try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(v, 'latin1')) } catch { return v } }
const addr = (v: string | undefined) => decodeWords(unraw(v ?? '')).replace(/\s+/g, ' ').trim()
function headerBlock(e: Entity): string {
  return [['From', 'from'], ['To', 'to'], ['Cc', 'cc'], ['Date', 'date'], ['Subject', 'subject']].map(([label, k]) => { const v = addr(e.headers.get(k!)); return v ? `${label}: ${v}` : '' }).filter(Boolean).join('\n')
}

export function fromEml(bytes: Uint8Array, filename: string): Extracted {
  const b = Buffer.from(bytes)
  if (b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) throw new SourceError('Outlook .msg files are not supported — save the email as .eml, or paste its text')
  if (b.subarray(0, 4096).includes(0)) throw new SourceError('That file does not look like an email (.eml)')
  const raw = b.toString('latin1').replace(/^﻿/, '')
  const root = parseEntity(raw)
  const known = ['from', 'subject', 'date', 'message-id', 'mime-version', 'received', 'to', 'content-type'].filter((k) => root.headers.has(k)).length
  if (known < 2) throw new SourceError('That file does not look like an email (.eml)')
  const out: Collected = { texts: [], attachments: [], parts: 0 }
  walk(root, 0, out)
  const body = clean(out.texts.join('\n\n')).slice(0, MAX_TEXT_CHARS)
  const attach = [...new Set(out.attachments)].slice(0, 30)
  const text = clean([headerBlock(root), body, attach.length ? `Attachments (not read): ${attach.join(', ')}` : ''].filter(Boolean).join('\n\n'))
  if (!body) throw new SourceError('No readable text found in that email (it may hold only attachments)')
  const subject = addr(root.headers.get('subject'))
  const from = addr(root.headers.get('from')).replace(/<[^>]*>/, '').trim()
  return { title: (subject || (from ? `Email from ${from}` : filename.replace(/\.eml$/i, '')) || 'Email').slice(0, 200), parts: [{ locator: from ? `email from ${from}`.slice(0, 80) : 'email', text }] }
}
