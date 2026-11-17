/** Text finder on generated slides, printed as JSON for suite 67: turned lines (90, 270, 15 degrees) and a curved line, Arabic / Hindi recall at 1600 and 2400 px, small text on an A3-size poster. */
import { slide } from './detect-fixtures.mjs'
import { scriptSlide, recall, posterSlide, wordRecall } from './script-fixtures.mjs'
import { createCanvas } from './detect-fixtures.mjs'
import { makeEngine, readImage, measure } from './ocr-node.mts'

const toWidth = (img: any, tw: number) => { const c = createCanvas(img.w, img.h), g = c.getContext('2d'), id = g.createImageData(img.w, img.h); id.data.set(img.data); g.putImageData(id, 0, 0); const k = tw / img.w, o = createCanvas(tw, Math.round(img.h * k)), og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, o.width, o.height); const d = og.getImageData(0, 0, o.width, o.height); return { data: new Uint8ClampedArray(d.data), w: d.width, h: d.height } }
const out: Record<string, unknown> = {}
{
  const e = await makeEngine(['eng'])
  const s = await slide({ photos: [], extra: (g: any) => {
    g.fillStyle = '#1b1b1b'
    g.save(); g.translate(1800, 200); g.rotate(Math.PI / 2); g.font = 'bold 44px Helvetica'; g.fillText('CONFIDENTIAL DRAFT', 0, 0); g.restore()
    g.save(); g.translate(1100, 900); g.rotate(-Math.PI / 2); g.font = 'bold 44px Helvetica'; g.fillText('Quarterly sidebar note', 0, 0); g.restore()
    g.save(); g.translate(1150, 700); g.rotate(15 * Math.PI / 180); g.font = 'bold 56px Helvetica'; g.fillText('Approved by finance', 0, 0); g.restore()
    g.save(); g.font = '54px Helvetica'; const t = 'Curved headline over arc', R = 260; for (let i = 0; i < t.length; i++) { const a = -Math.PI * 0.35 + (i / t.length) * Math.PI * 0.7; g.save(); g.translate(300 + R * Math.sin(a), 1000 - R * Math.cos(a)); g.rotate(a); g.fillText(t[i]!, 0, 0); g.restore() } g.restore()
  } })
  const notes = { turned: 0, curved: 0 } as any
  const runs = await readImage(s.img, e.rec, { measure, notes })
  out.turned = { notes, runs: runs.map((r: any) => ({ str: r.str, rot: r.box.rot ? Math.round(r.box.rot * 10) / 10 : 0, cx: Math.round(r.box.x + r.box.w / 2), cy: Math.round(r.box.y + r.box.h / 2) })) }
  await e.close()
}
{
  const res: Record<string, Record<string, number>> = {}
  for (const lang of ['ara', 'hin'] as const) {
    const e = await makeEngine(lang === 'ara' ? ['ara', 'eng'] : ['hin', 'eng'])
    for (const width of [1600, 2400]) {
      let hit = 0, tot = 0
      for (const fi of [0, 1]) for (const px of [16, 24, 32]) for (const dark of [false, true]) {
        const s = await scriptSlide(lang, fi, px, { quality: 70, dark }); if (!s) continue
        const runs = await readImage(toWidth(s.img, width), e.rec, { measure })
        const r = recall(s.words, runs.map((x: any) => x.str).join(' ')); hit += r.hit; tot += r.total
      }
      ;(res[lang] ??= {})[String(width)] = Math.round((1000 * hit) / tot) / 10
    }
    await e.close()
  }
  out.scripts = res
}
{
  const e = await makeEngine(['eng']), res: Record<string, Record<string, number>> = {}
  for (const dpi of [200, 100]) {
    const p = await posterSlide({ dpi, quality: 60 })
    const runs = await readImage(toWidth(p.img, Math.min(1600, p.W)), e.rec, { measure })
    const text = runs.map((r: any) => r.str).join(' ')
    res[String(dpi)] = Object.fromEntries(Object.entries(p.words).map(([pt, w]: any) => [`${pt}pt`, Math.round(100 * wordRecall(w, text).recall)]))
  }
  out.poster = res
  await e.close()
}
console.log(JSON.stringify(out))
