/**
 * Load test for file sources (C4) against a RUNNING API (dev only; refuses production):
 *   tsx scripts/load-sources.ts [label]            env: API=http://localhost:4000  PORT=4000  USERS=20
 * It signs up real users, then uploads heavy and hostile files in parallel at 1 / 5 / 10 / 20 at once and reports, per scenario:
 * how many were accepted or refused (and with what), how long each upload took, how long a plain /health call stalled meanwhile (the event loop being
 * blocked), and the API process's peak memory. Results are printed and written to /private/tmp/load-sources-<label>.json.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { isProd } from '../src/env.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const API = process.env['API'] ?? 'http://localhost:4000'
const WEB = process.env['WEB_ORIGIN'] ?? 'http://localhost:3100'
const PORT = process.env['PORT_API'] ?? '4000'
const USERS = Number(process.env['USERS'] ?? 60)
const label = process.argv[2] ?? 'run'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── the files ───────────────────────────────────────────────────────────────
const rnd = (n: number) => { let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n) }
const xlsxFrom = (sheetXml: string) => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/worksheets/sheet1.xml': strToU8(sheetXml) }, { level: 6 })
function bigRealisticXlsx(): Buffer { // random text: does not compress, so the zip is large
  const rows: string[] = []; let size = 0, i = 0
  while (size < 32 * 1024 * 1024) { const r = `<row r="${++i}"><c r="A${i}"><v>${i}</v></c><c r="B${i}" t="inlineStr"><is><t>${rnd(40)}</t></is></c><c r="C${i}" t="inlineStr"><is><t>${rnd(30)}</t></is></c><c r="D${i}"><v>${(Math.random() * 1e6).toFixed(2)}</v></c></row>`; rows.push(r); size += r.length }
  return Buffer.from(xlsxFrom(`<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`))
}
function hostileXlsx(): Buffer { // a tiny file that declares as much as the guard allows (39 MB of rows)
  const row = (i: number) => `<row r="${i}"><c r="A${i}" t="inlineStr"><is><t>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</t></is></c><c r="B${i}"><v>${i}</v></c></row>`
  const rows: string[] = []; let size = 0, i = 0; while (size < 39 * 1024 * 1024) { const r = row(++i); rows.push(r); size += r.length }
  return Buffer.from(xlsxFrom(`<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`))
}
function hostileDocx(): Buffer { // a tiny file whose document.xml is 29 MB of paragraphs and nested tables
  const p = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading text that repeats and repeats</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>cell b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
  let body = ''; while (body.length < 29 * 1024 * 1024) body += p
  return Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(`<w:document><w:body>${body}</w:body></w:document>`) }, { level: 6 }))
}
function bigCsv(): Buffer { let s = 'id;name;note;amount\n'; let i = 0; while (s.length < 14.5 * 1024 * 1024) { s += `${++i};${rnd(20)};"${rnd(40)}, with a comma";${(Math.random() * 1e4).toFixed(2)}\n` } return Buffer.from(s) }
function smallXlsx(): Buffer { return Buffer.from(xlsxFrom('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Hello</t></is></c></row><row r="2"><c r="A2"><v>42</v></c></row></sheetData></worksheet>')) }

const FILES: Record<string, { name: string; bytes: Buffer }> = {}
console.log('building files…')
FILES['realistic-xlsx'] = { name: 'big.xlsx', bytes: bigRealisticXlsx() }
FILES['hostile-xlsx'] = { name: 'tiny-but-39MB-inside.xlsx', bytes: hostileXlsx() }
FILES['hostile-docx'] = { name: 'tiny-but-29MB-inside.docx', bytes: hostileDocx() }
FILES['big-csv'] = { name: 'big.csv', bytes: bigCsv() }
FILES['small-xlsx'] = { name: 'small.xlsx', bytes: smallXlsx() }
for (const [k, f] of Object.entries(FILES)) console.log(`  ${k}: ${(f.bytes.length / 1048576).toFixed(2)} MB on the wire`)

// ─── users ───────────────────────────────────────────────────────────────────
const USERS_FILE = '/private/tmp/load-sources-users.json'
let cookies: string[] = []
if (existsSync(USERS_FILE)) { // reuse the users of an earlier run while their sessions still work (dev sign-ups are limited per hour)
  const saved = JSON.parse(readFileSync(USERS_FILE, 'utf8')) as string[]
  const ok = saved.length > 0 && (await fetch(`${API}/api/v1/me`, { headers: { Cookie: saved[0]! } })).ok
  if (ok) cookies = saved.slice(0, USERS)
}
for (let i = cookies.length; i < USERS; i++) {
  const r = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: WEB }, body: JSON.stringify({ email: `load${Date.now()}${i}${Math.floor(Math.random() * 1e4)}@example.com`, password: 'Passw0rd!load-test', name: 'Load' }) })
  if (!r.ok) throw new Error(`sign-up ${i}: ${r.status} ${await r.text()}`)
  cookies.push(r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '))
  writeFileSync(USERS_FILE, JSON.stringify(cookies)); await sleep(1100) // the sign-up endpoint allows 60 a minute
}
writeFileSync(USERS_FILE, JSON.stringify(cookies))
console.log(`${USERS} users ready`)

const pid = (() => { try { return execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t`).toString().trim().split('\n')[0] } catch { return '' } })()
const rss = () => { try { return Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024 } catch { return 0 } }
// the dev server runs under `tsx watch`: the real worker is the child that listens on the port; sum is not needed
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!) : 0 }

async function upload(cookie: string, f: { name: string; bytes: Buffer }) {
  const t0 = Date.now()
  // built by hand so the request carries a Content-Length, as a browser's does (Node's own form helper streams without one)
  const boundary = `----load${Math.random().toString(36).slice(2)}`
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)])
  try {
    const r = await fetch(`${API}/api/v1/sources/file`, { method: 'POST', headers: { Cookie: cookie, Origin: WEB, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(body.length) }, body, signal: AbortSignal.timeout(180_000) })
    const json = await r.json().catch(() => ({})) as { error?: { message?: string }; data?: { id?: string } }
    return { status: r.status, ms: Date.now() - t0, msg: json.error?.message ?? '', id: json.data?.id }
  } catch (e) { return { status: 0, ms: Date.now() - t0, msg: String((e as Error).message ?? e).slice(0, 80), id: undefined } }
}

const results: unknown[] = []
let turn = 0
const nextCookie = () => cookies[turn++ % cookies.length]!
async function scenario(fileKey: string, concurrency: number) {
  const f = FILES[fileKey]!
  let peak = rss(); const base = peak
  const lag: number[] = []; let stop = false
  const probe = (async () => { while (!stop) { const t = Date.now(); await fetch(`${API}/health`).then((r) => r.text()).catch(() => {}); lag.push(Date.now() - t); await sleep(100) } })()
  const mem = (async () => { while (!stop) { peak = Math.max(peak, rss()); await sleep(150) } })()
  const t0 = Date.now()
  const out = await Promise.all(Array.from({ length: concurrency }, () => upload(nextCookie(), f)))
  const wall = Date.now() - t0
  stop = true; await Promise.all([probe, mem])
  for (const o of out) if (o.id) await fetch(`${API}/api/v1/sources/${o.id}`, { method: 'DELETE', headers: { Cookie: cookies[0]!, Origin: WEB } }).catch(() => {})
  const by = out.reduce<Record<string, number>>((m, o) => { const k = `${o.status}${o.msg ? ' ' + o.msg.slice(0, 48) : ''}`; m[k] = (m[k] ?? 0) + 1; return m }, {})
  const row = { file: fileKey, concurrency, wallMs: wall, uploadMs: { p50: pct(out.map((o) => o.ms), 50), p95: pct(out.map((o) => o.ms), 95), max: Math.max(...out.map((o) => o.ms)) }, healthMs: { p50: pct(lag, 50), p95: pct(lag, 95), max: Math.max(0, ...lag), samples: lag.length }, rssMB: { start: Math.round(base), peak: Math.round(peak) }, outcomes: by }
  results.push(row)
  console.log(`${fileKey.padEnd(15)} ×${String(concurrency).padEnd(3)} wall ${String(wall).padStart(6)}ms | upload p50 ${row.uploadMs.p50} p95 ${row.uploadMs.p95} max ${row.uploadMs.max} | /health p95 ${row.healthMs.p95} MAX ${row.healthMs.max}ms | RSS ${row.rssMB.start}→${row.rssMB.peak} MB | ${JSON.stringify(by)}`)
  await sleep(2500) // let memory settle
}

const ONLY = process.env['SOAK'] ? ['none'] : (process.env['ONLY'] ?? '').split(',').filter(Boolean)
for (const [k, levels] of [['small-xlsx', [1, 20]], ['realistic-xlsx', [1, 5, 10, 20]], ['hostile-xlsx', [1, 5, 10, 20]], ['hostile-docx', [1, 5, 10, 20]], ['big-csv', [1, 10]]] as const) if (!ONLY.length || ONLY.includes(k)) for (const c of levels) await scenario(k, c)
if (process.env['SOAK']) { // many rounds of mixed heavy and light uploads: memory must plateau, not creep
  const rounds = Number(process.env['SOAK']); const seen: number[] = []
  for (let r = 1; r <= rounds; r++) {
    const batch = ['hostile-docx', 'hostile-xlsx', 'realistic-xlsx', 'big-csv', 'small-xlsx', 'small-xlsx', 'small-xlsx', 'small-xlsx']
    await Promise.all(batch.map((k) => upload(nextCookie(), FILES[k]!)))
    await sleep(1500); seen.push(Math.round(rss())); console.log(`soak round ${String(r).padStart(2)}: RSS ${seen.at(-1)} MB`)
  }
  const first = seen.slice(1, 4).reduce((a, b) => a + b, 0) / 3, last = seen.slice(-3).reduce((a, b) => a + b, 0) / 3
  console.log(`soak: first rounds avg ${Math.round(first)} MB, last rounds avg ${Math.round(last)} MB, growth ${Math.round(last - first)} MB over ${rounds} rounds`)
  results.push({ soak: { rounds, rss: seen } })
}
// and the real-world mix: a few heavy uploads while ordinary traffic keeps flowing
console.log(`final RSS ${Math.round(rss())} MB`)
writeFileSync(`/private/tmp/load-sources-${label}.json`, JSON.stringify({ at: new Date().toISOString(), node: process.version, results }, null, 2))
