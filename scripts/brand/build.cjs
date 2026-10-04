/**
 * Rasterises the brand mark (scripts/brand/mark*.svg) into favicons, app icons, the social image and logo lockups.
 * Run from this folder in a scratch dir that has `playwright-core` installed:  CHROME_PATH=/path/to/chrome node build.cjs
 * Then copy the PNGs into apps/web/public (and favicon-32x32 / apple-touch-icon into apps/editor/public). See docs/BRAND.md.
 */
const { chromium } = require('playwright-core')
const fs = require('fs')
const mark = fs.readFileSync('mark.svg', 'utf8')
const markSq = fs.readFileSync('mark-square.svg', 'utf8')
const inline = (svg, size) => svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Sora:wght@300;800&display=swap" rel="stylesheet">`
const page = (body, bg = 'transparent') => `<html><head>${FONT}<style>html,body{margin:0;background:${bg};font-family:'Plus Jakarta Sans',system-ui,sans-serif}</style></head><body>${body}</body></html>`
const lockup = (h, dark) => {
  const from = dark ? '#6C8FFF' : '#0B3DD0'
  return `<div style="display:inline-flex;align-items:center;gap:${h * 0.28}px;padding:${h * 0.1}px">${inline(mark, h)}<span style="font-family:Sora,sans-serif;font-size:${h * 0.74}px;letter-spacing:-0.03em;line-height:1;color:${dark ? '#fff' : '#181b25'};white-space:nowrap"><span style="font-weight:300">prompt</span><span style="font-weight:800;color:${from};background:linear-gradient(90deg,${from} 0%,${from} 28%,#FF5722 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">ToPpt</span></span></div>`
}
const og = `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:linear-gradient(135deg,#0B3DD0 0%,#082A9A 100%)">
  <div style="position:absolute;right:-120px;top:-140px;width:560px;height:560px;border-radius:50%;background:rgba(255,223,0,.18)"></div>
  <div style="position:absolute;right:120px;bottom:-200px;width:440px;height:440px;border-radius:50%;background:rgba(255,87,34,.22)"></div>
  <div style="position:absolute;left:72px;top:64px">${lockup(84, true)}</div>
  <div style="position:absolute;left:72px;top:228px;width:640px;color:#fff;font-weight:800;font-size:68px;line-height:1.06;letter-spacing:-0.025em">Turn any prompt into a beautiful presentation</div>
  <div style="position:absolute;left:72px;top:470px;width:640px;color:rgba(255,255,255,.85);font-weight:500;font-size:28px;line-height:1.35">AI slides and 120 animated templates.</div>
  <div style="position:absolute;right:84px;top:150px;width:360px;height:230px;border-radius:22px;background:#fff;transform:rotate(6deg);box-shadow:0 30px 60px rgba(0,0,0,.35);padding:28px;box-sizing:border-box"><div style="width:60px;height:8px;border-radius:4px;background:#FFDF00;margin-bottom:18px"></div><div style="height:22px;width:70%;border-radius:6px;background:#181b25;margin-bottom:12px"></div><div style="height:12px;width:90%;border-radius:6px;background:#cbd5e1;margin-bottom:8px"></div><div style="height:12px;width:78%;border-radius:6px;background:#cbd5e1"></div></div>
  <div style="position:absolute;right:150px;top:330px;width:360px;height:230px;border-radius:22px;background:#FF5722;transform:rotate(-5deg);box-shadow:0 30px 60px rgba(0,0,0,.35);padding:28px;box-sizing:border-box"><div style="height:22px;width:60%;border-radius:6px;background:#fff;margin-bottom:14px"></div><div style="display:flex;gap:14px;align-items:flex-end;height:110px"><div style="flex:1;height:45%;background:rgba(255,255,255,.55);border-radius:6px"></div><div style="flex:1;height:70%;background:rgba(255,255,255,.75);border-radius:6px"></div><div style="flex:1;height:100%;background:#fff;border-radius:6px"></div></div></div>
</div>`
;(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
  const snap = async (html, w, h, out, scale = 1, bg = false) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale })
    await p.setContent(html, { waitUntil: 'networkidle' })
    await p.evaluate(() => document.fonts.ready)
    await p.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } })
    await p.close()
  }
  for (const s of [16, 32, 48, 192, 512]) await snap(page(inline(mark, s)), s, s, `png-${s}.png`)
  await snap(page(inline(markSq, 180)), 180, 180, 'apple-touch-icon.png', 1, true)
  await snap(page(og, '#0B3DD0'), 1200, 630, 'og-image.png', 1, true)
  const probe = await b.newPage(); await probe.setContent(page(lockup(64, false))); await probe.evaluate(() => document.fonts.ready)
  const box = await probe.evaluate(() => { const r = document.body.firstElementChild.getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(r.height) } }); await probe.close()
  await snap(page(lockup(64, false)), box.w, box.h, 'logo-lockup.png', 2)
  await snap(page(lockup(64, true)), box.w, box.h, 'logo-lockup-dark.png', 2)
  await b.close()
})()
