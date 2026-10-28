// Renders the SlidesDone brand files (favicons, app icons, logo lock-ups, social card) from the mark. Run: node e2e/make-brand-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './lib.mjs'
const web = new URL('../apps/web/public/', import.meta.url).pathname
const editor = new URL('../apps/editor/public/', import.meta.url).pathname
const app = new URL('../apps/web/app/', import.meta.url).pathname
const round = readFileSync(join(web, 'favicon.svg'), 'utf8')
const full = round.replace('rx="16"', 'rx="0"')
const svgUrl = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;800&family=Inter:wght@500;700&display=swap" rel="stylesheet">`
const word = (dark, px) => `<span style="font-family:Sora,system-ui,sans-serif;font-size:${px}px;letter-spacing:-0.03em;line-height:1;white-space:nowrap;color:${dark ? '#fff' : '#181b25'}"><span style="font-weight:300">Slides</span><span style="font-weight:800;background:linear-gradient(90deg,${dark ? '#6C8FFF' : '#0B3DD0'} 0%,${dark ? '#6C8FFF' : '#0B3DD0'} 35%,#FF5722 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">Done</span></span>`
const b = await launch()
const shot = async (html, w, h, path, transparent = false) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500)
  writeFileSync(path, await p.screenshot({ type: 'png', omitBackground: transparent })); await p.close()
}
const icon = (svg, px) => `<html><body style="margin:0;background:transparent"><img src="${svgUrl(svg)}" width="${px}" height="${px}" style="display:block"></body></html>`
const png = {}
for (const [name, svg, px] of [['favicon-16x16', round, 16], ['favicon-32x32', round, 32], ['favicon-48', round, 48], ['apple-touch-icon', full, 180], ['android-chrome-192x192', full, 192], ['android-chrome-512x512', full, 512]]) {
  const path = join(web, `${name}.png`); await shot(icon(svg, px), px, px, path, true); png[name] = readFileSync(path)
}
// favicon.ico = 16 + 32 + 48 (PNG entries)
const entries = [[16, png['favicon-16x16']], [32, png['favicon-32x32']], [48, png['favicon-48']]]
const head = Buffer.alloc(6 + entries.length * 16); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
let off = head.length
entries.forEach(([px, data], i) => { const o = 6 + i * 16; head[o] = px; head[o + 1] = px; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(off, o + 12); off += data.length })
const ico = Buffer.concat([head, ...entries.map(([, d]) => d)])
for (const dir of [web, app, editor]) writeFileSync(join(dir, 'favicon.ico'), ico)
writeFileSync(join(editor, 'favicon-32x32.png'), png['favicon-32x32']); writeFileSync(join(editor, 'apple-touch-icon.png'), png['apple-touch-icon'])
// lock-ups (mark + wordmark), transparent background, 810×154 like before
for (const dark of [false, true]) {
  await shot(`<html><head>${FONT}</head><body style="margin:0;background:transparent"><div style="height:154px;display:flex;align-items:center;gap:36px;padding-left:6px"><img src="${svgUrl(round)}" width="132" height="132">${word(dark, 104)}</div></body></html>`, 810, 154, join(web, dark ? 'logo-lockup-dark.png' : 'logo-lockup.png'), true)
}
// social card 1200×630
await shot(`<html><head>${FONT}</head><body style="margin:0"><div style="width:1200px;height:630px;position:relative;overflow:hidden;background:linear-gradient(135deg,#1743d6 0%,#0B3DD0 45%,#06226f 100%);font-family:Inter,system-ui,sans-serif;color:#fff">
<div style="position:absolute;right:-60px;top:70px;width:520px;height:330px;border-radius:28px;background:#fff;transform:rotate(7deg);box-shadow:0 30px 70px rgba(0,0,0,.35)"><div style="margin:44px;width:230px;height:30px;border-radius:15px;background:#0B3DD0"></div><div style="margin:0 44px 18px;height:20px;width:380px;border-radius:10px;background:#C9D5FA"></div><div style="margin:0 44px;height:20px;width:250px;border-radius:10px;background:#C9D5FA"></div></div>
<div style="position:absolute;right:120px;top:360px;width:150px;height:150px;border-radius:75px;background:#FFDF00;border:12px solid #0B3DD0;display:grid;place-items:center"><svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="#0B3DD0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 6.5"/></svg></div>
<div style="position:absolute;left:80px;top:78px;display:flex;align-items:center;gap:26px"><img src="${svgUrl(round)}" width="104" height="104">${word(true, 84)}</div>
<div style="position:absolute;left:80px;top:290px;width:640px;white-space:nowrap;font-weight:700;font-size:56px;line-height:1.1;letter-spacing:-0.02em">AI presentation maker</div>
<div style="position:absolute;left:80px;top:376px;width:560px;font-weight:500;font-size:29px;line-height:1.35;color:#cfdcff">Turn a prompt, PDF, picture or notes into a finished, editable deck.</div>
</div></body></html>`, 1200, 630, join(web, 'og-image.png'))
await b.close()
console.log('brand files written to apps/web/public, apps/web/app and apps/editor/public')
