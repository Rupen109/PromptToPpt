/**
 * Runs every .docx / .xlsx / .xlsm in a folder through the file readers and reports what happened (no database, no server):
 *   tsx scripts/real-office-check.ts <folder>
 * A file is "fine" when it is read, or refused with one of OUR plain-language messages (SourceError). "UNEXPECTED" = the reader threw something else
 * (a bug: the person would only see "Could not read that file"). Used with files saved by real Word / Excel (public test-file collections).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromFile, SourceError } from '../src/sources/extract.ts'

const dir = process.argv[2]
if (!dir) { console.error('usage: real-office-check.ts <folder>'); process.exit(1) }
const files = readdirSync(dir).filter((f) => /\.(docx|docm|xlsx|xlsm)$/i.test(f)).sort()
const tally: Record<string, number> = { read: 0, refused: 0, unexpected: 0, empty: 0 }
const refusals = new Map<string, number>(); const odd: string[] = []; const slow: string[] = []
for (const f of files) {
  const bytes = new Uint8Array(readFileSync(join(dir, f))); const t0 = Date.now()
  try {
    const r = await fromFile(bytes, f); const chars = r.extracted.parts.reduce((n, p) => n + p.text.length, 0)
    tally['read']!++; if (chars < 5) { tally['empty']!++; odd.push(`${f}: read but only ${chars} characters`) }
    if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(r.extracted.parts.map((p) => p.text).join(''))) odd.push(`${f}: control characters in the text`)
    if (/<\/?w:|<\/?x:|&amp;|&lt;[a-z]/.test(r.extracted.parts.map((p) => p.text).join(''))) odd.push(`${f}: XML left in the text`)
  } catch (e) {
    if (e instanceof SourceError || /^(That file|PDF |No text|Old \.ppt|No slides|That PowerPoint|That presentation|Text files|Unsupported file|PowerPoint files|That file has)/.test((e as Error).message)) { tally['refused']!++; const m = (e as Error).message.slice(0, 90); refusals.set(m, (refusals.get(m) ?? 0) + 1) }
    else { tally['unexpected']!++; odd.push(`UNEXPECTED ${f}: ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 120)}`) }
  }
  const ms = Date.now() - t0; if (ms > 1500) slow.push(`${f}: ${ms} ms`)
}
console.log(`${files.length} files →`, JSON.stringify(tally))
console.log('refusals:'); for (const [m, n] of [...refusals].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${m}`)
if (odd.length) console.log('odd:\n  ' + odd.join('\n  '))
if (slow.length) console.log('slow:\n  ' + slow.join('\n  '))
