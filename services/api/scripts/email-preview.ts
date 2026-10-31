/**
 * See every e-mail SlidesDone sends, with sample data, in your browser:
 *   pnpm --filter @prompttoppt/api email:preview      → writes services/api/.data/email-preview/index.html (git-ignored)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SAMPLES } from '../src/lib/email-templates.ts'

const dir = resolve(import.meta.dirname, '../.data/email-preview')
mkdirSync(dir, { recursive: true })
const names = Object.keys(SAMPLES)
for (const name of names) writeFileSync(resolve(dir, `${name}.html`), SAMPLES[name]!().html)
const cards = names.map((n) => `<section><h2>${n}</h2><p class="s">${SAMPLES[n]!().subject.replace(/</g, '&lt;')}</p><iframe src="${n}.html" loading="lazy"></iframe></section>`).join('\n')
writeFileSync(resolve(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>SlidesDone emails</title><style>body{font:15px system-ui;margin:24px;background:#eef0f6}h1{margin:0 0 18px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(620px,1fr));gap:22px}section{background:#fff;border:1px solid #d9deea;border-radius:12px;padding:14px}h2{margin:0;font-size:16px}.s{margin:4px 0 10px;color:#475569}iframe{width:100%;height:760px;border:1px solid #e3e7f1;border-radius:8px;background:#f6f7fc}</style><h1>SlidesDone emails (sample data)</h1><div class="g">${cards}</div>`)
console.log(`Wrote ${names.length} emails to ${dir}\nOpen: ${resolve(dir, 'index.html')}`)
