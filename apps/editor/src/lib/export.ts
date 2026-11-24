import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { getFontEmbedCSS, toJpeg, toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { strToU8, zipSync } from 'fflate'
import { MOTION_CSS, SlideCanvas, ensureFonts, fontsHref, transitionStyle } from '@prompttoppt/ui'
import { CANVAS, slidesFileSuffix, type Presentation } from '@prompttoppt/validation'

type Progress = (done: number, total: number) => void
export type ClientFormat = 'pdf' | 'png' | 'jpg' | 'html'

const slug = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'presentation'
const tick = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** The deck positions (0-based) an export takes: the slides asked for, in deck order, or all of them. */
const picked = (doc: Presentation, slideIds?: readonly string[]) => doc.slides.map((s, i) => (slideIds && !slideIds.includes(s.id) ? -1 : i)).filter((i) => i >= 0)

/**
 * Renders the slides (all, or the ones at `which`) at their full canvas size, off-screen, and hands each live node to `fn`. A slide keeps its own number in the footer ("07 / 12" when
 * slide 7 is exported alone), as the editor shows it.
 */
async function withSlides<T>(doc: Presentation, fn: (node: HTMLElement, index: number) => Promise<T>, onProgress?: Progress, play = false, which: number[] = doc.slides.map((_, i) => i)): Promise<T[]> {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  ensureFonts([doc.theme.fonts.heading, doc.theme.fonts.body])
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-${W + 200}px;top:0;width:${W}px;height:${H}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  const out: T[] = []
  try {
    for (const [k, i] of which.entries()) {
      flushSync(() => root.render(createElement(SlideCanvas, { slide: doc.slides[i]!, theme: doc.theme, aspect: doc.aspectRatio, width: W, footer: { index: i, total: doc.slides.length, title: doc.title }, play })))
      await document.fonts.ready
      await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? Promise.resolve() : new Promise<void>((r) => { im.onload = im.onerror = () => r() }))))
      await tick()
      out.push(await fn(host.firstElementChild as HTMLElement, i))
      onProgress?.(k + 1, which.length)
    }
  } finally {
    root.unmount()
    host.remove()
  }
  return out
}

const dataUrlToBytes = (u: string) => Uint8Array.from(atob(u.split(',')[1]!), (c) => c.charCodeAt(0))

async function renderImages(doc: Presentation, type: 'png' | 'jpg', which: number[], onProgress?: Progress): Promise<string[]> {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  let fontCss: string | undefined
  return withSlides(doc, async (node) => {
    fontCss ??= await getFontEmbedCSS(node).catch(() => '')
    const opts = { width: W, height: H, pixelRatio: 1, fontEmbedCSS: fontCss, backgroundColor: doc.theme.colors.background, cacheBust: false }
    return type === 'png' ? toPng(node, opts) : toJpeg(node, { ...opts, quality: 0.92 })
  }, onProgress, false, which)
}

/** Runs a browser export and reports how it went (ok / failed + timing) for the owner's Exports section. */
/**
 * Runs a browser export and reports how it went (ok / failed + timing) for the owner's Exports section. `slideIds`: only these slides (in deck order); the file is named after them
 * ("Deck-slide-7.png", "Deck-slides-1-3_5.pdf").
 */
export async function exportClient(doc: Presentation, format: ClientFormat, onProgress?: Progress, report?: (o: { ok: boolean; durationMs: number; slideCount: number; error?: string }) => void, slideIds?: readonly string[]): Promise<void> {
  const t0 = performance.now()
  const which = picked(doc, slideIds)
  try {
    if (!which.length) throw new Error('none of the chosen slides is in the deck')
    await renderExport(doc, format, which, onProgress)
    report?.({ ok: true, durationMs: Math.round(performance.now() - t0), slideCount: which.length })
  } catch (e) {
    report?.({ ok: false, durationMs: Math.round(performance.now() - t0), slideCount: which.length, error: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}

async function renderExport(doc: Presentation, format: ClientFormat, which: number[], onProgress?: Progress): Promise<void> {
  const name = slug(doc.title) + slidesFileSuffix(which.map((i) => i + 1), doc.slides.length)
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  if (format === 'png' || format === 'jpg') {
    const urls = await renderImages(doc, format, which, onProgress)
    if (urls.length === 1) return download(new Blob([dataUrlToBytes(urls[0]!)], { type: format === 'png' ? 'image/png' : 'image/jpeg' }), `${name}.${format}`)
    const files: Record<string, Uint8Array> = {}
    // each picture is named by its slide's own number, so slide 5 of a part is "-05", not the 3rd file
    urls.forEach((u, k) => { files[`${slug(doc.title)}-${String(which[k]! + 1).padStart(2, '0')}.${format}`] = dataUrlToBytes(u) })
    return download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${name}${which.length === doc.slides.length ? '-slides' : ''}.zip`)
  }
  if (format === 'pdf') {
    const urls = await renderImages(doc, 'jpg', which, onProgress)
    const pdf = new jsPDF({ unit: 'px', format: [W, H], orientation: W >= H ? 'landscape' : 'portrait', hotfixes: ['px_scaling'], compress: true })
    urls.forEach((u, i) => { if (i > 0) pdf.addPage([W, H], W >= H ? 'landscape' : 'portrait'); pdf.addImage(u, 'JPEG', 0, 0, W, H) })
    pdf.setProperties({ title: doc.title })
    return download(pdf.output('blob'), `${name}.pdf`)
  }
  return download(await buildHtml(doc, which, onProgress), `${name}.html`)
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.onerror = () => r(null); f.readAsDataURL(blob) })
  } catch { return null }
}

/**
 * One self-contained .html file: slides + pictures inlined, arrow-key / click / swipe navigation, scales to any screen. It plays what the deck does with plain CSS: each slide's transition
 * (fade, slide, zoom, push, wipe) and the design's entrance animations start every time a slide is shown, and stop under "reduce motion". Not included (they need the full player): the
 * object effects timeline and Morph; those slides show their finished state, and a Morph arrives as a fade.
 */
async function buildHtml(doc: Presentation, which: number[], onProgress?: Progress): Promise<Blob> {
  const { width: W, height: H } = CANVAS[doc.aspectRatio]
  const cache = new Map<string, string | null>()
  const inline = async (u: string) => { if (!cache.has(u)) cache.set(u, await toDataUrl(u)); return cache.get(u) ?? u }
  // a number that counts up is driven by script, which this file does not carry: it fades in with its final value instead of freezing at its first frame
  const playDoc: Presentation = { ...doc, slides: doc.slides.map((sl) => ({ ...sl, elements: sl.elements.map((e) => (e.animation?.type === 'count-up' ? { ...e, animation: { ...e.animation, type: 'fade' as const } } : e)) })) }
  const sections = await withSlides(playDoc, async (node, i) => {
    const clone = node.cloneNode(true) as HTMLElement
    for (const im of clone.querySelectorAll('img')) { const s = im.getAttribute('src'); if (s && !s.startsWith('data:')) im.setAttribute('src', await inline(s)) }
    for (const el of [clone, ...clone.querySelectorAll<HTMLElement>('[style*="url("]')]) {
      const st = el.getAttribute('style') ?? ''
      const m = /url\((["']?)(https?:[^)"']+)\1\)/.exec(st)
      if (m) el.setAttribute('style', st.replace(m[2]!, await inline(m[2]!)))
    }
    // the section is scaled to the screen; the transition plays on a wrapper inside it (a transition moves the slide, which would fight the scaling)
    const tr = (transitionStyle(doc.slides[i]!, doc.theme.motion?.transition) as { animation?: string }).animation
    return `<section class="s" data-i="${which.indexOf(i)}" aria-label="Slide ${i + 1}"><div class="t"${tr ? ` data-pt-transition style="animation:${tr.replace(/["<>]/g, '')}"` : ''}>${clone.outerHTML}</div></section>`
  }, onProgress, true, which)
  const fonts = fontsHref([doc.theme.fonts.heading, doc.theme.fonts.body])
  const title = doc.title.replace(/[<>&"'`]/g, '')
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(doc.language) ? doc.language : 'en' // goes into an attribute: never trust it
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${fonts ? `<link rel="stylesheet" href="${fonts}">` : ''}
<style>${MOTION_CSS}html,body{margin:0;height:100%;background:#000;overflow:hidden}.s{position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;transform-origin:center;display:none;overflow:hidden}.s.on{display:block}.t{width:100%;height:100%;position:relative}.hud{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);color:#fff9;font:12px system-ui;user-select:none}</style></head>
<body>${sections.join('')}<div class="hud" id="hud"></div>
<script>(function(){var s=[].slice.call(document.querySelectorAll('.s')),i=0,hud=document.getElementById('hud');function fit(){var k=Math.min(innerWidth/${W},innerHeight/${H});s.forEach(function(e){e.style.transform='translate(-50%,-50%) scale('+k+')'})}function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(e,j){e.classList.toggle('on',j===i)});hud.textContent=(i+1)+' / '+s.length+'  ·  ← → to navigate';location.hash=i+1}
addEventListener('resize',fit);addEventListener('keydown',function(e){if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].indexOf(e.key)>-1){e.preventDefault();show(i+1)}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].indexOf(e.key)>-1){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1)});
addEventListener('click',function(e){show(e.clientX<innerWidth/3?i-1:i+1)});var x0;addEventListener('touchstart',function(e){x0=e.touches[0].clientX});addEventListener('touchend',function(e){var d=e.changedTouches[0].clientX-x0;if(Math.abs(d)>40)show(d<0?i+1:i-1)});fit();show((parseInt(location.hash.slice(1),10)||1)-1)})();</script></body></html>`
  return new Blob([strToU8(html)], { type: 'text/html' })
}
