import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CANVAS, TEXT_ALIGN_CSS, chartLookOn, patternSvg, gradientCss, canRotate, clipPolygonCss, dashArray, textShadowCss, transformOf, isRunItalic, runWeight, textBaseWeight, cropImgCss, highlightText, cellSpans, alignOf, isCropped, pictureColorMatrix, colorMatrixValues, pictureFilterCss, pictureOutline, pictureShadowCss, pictureZoomCss, shapeDef, type Animation, type AspectRatio, type PictureCrop, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { resolveColor, slideBase, slideTheme } from '@prompttoppt/theme'
import { MOTION_CSS } from './animations.css'
import { Chart } from './charts'
import { ensureFonts } from './fonts'
import { hiddenAtStart } from './motion'
import { easingCss } from './motion/keyframes'

/**
 * Draw the "Photo by … on Unsplash" label on slide pictures. OFF by owner decision (2026-10-09): the credit data is still saved on every
 * picture. NOTE: Unsplash's API guidelines require crediting the photographer and Unsplash wherever their photos appear, and the
 * Production-key application checks it — see docs/PRODUCTION_RELEASE_CHECKLIST.md before launch.
 */
export const SHOW_PHOTO_CREDIT = false

const HEADING_ROLES = new Set<TextElement['role']>(['title', 'heading', 'metric', 'subtitle'])

/** Injects the motion keyframes once per document. */
function useMotionCss() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('pt-motion-css')) return
    const s = document.createElement('style')
    s.id = 'pt-motion-css'
    s.textContent = MOTION_CSS
    document.head.appendChild(s)
  }, [])
}

/** Ambient motion that keeps playing while the slide is on screen (slow photo zoom, floating shapes). */
const LOOPS = new Set(['kenburns', 'float', 'drift'])
const AMBIENT = LOOPS
const withoutAnimation = (el: SlideElement): SlideElement => { const { animation: _gone, ...rest } = el; return rest as SlideElement }
const anim = (a: Animation | undefined, play: boolean, extraDelay = 0): CSSProperties => {
  if (!a || !play) return {}
  if (LOOPS.has(a.type)) return { animation: `pt-${a.type} ${a.duration}ms ease-in-out ${a.delay + extraDelay}ms infinite ${a.type === 'kenburns' ? 'alternate' : 'normal'} both` }
  return { animation: `pt-${a.type} ${a.duration}ms cubic-bezier(.2,.7,.2,1) ${a.delay + extraDelay}ms both` }
}

/** Only http(s) (and mailto) links are ever rendered as hrefs — a `javascript:` link in an old or imported deck must be inert. */
export const safeHref = (u: string | undefined) => (u && /^(https?:\/\/|mailto:)/i.test(u.trim()) ? u : undefined)
const safeBgUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.replace(/["\\()]/g, '') : '')

const CLIP_PATH = {
  none: undefined,
  circle: 'circle(50% at 50% 50%)',
  diagonal: clipPolygonCss('diagonal'),
  'diagonal-flip': clipPolygonCss('diagonal-flip'),
  hex: clipPolygonCss('hex'),
} as const

/** Animates the leading number of a metric ("$12.4M", "98%", "3x") from 0; non-numeric text is shown as is. */
function CountUp({ text, duration, delay, play }: { text: string; duration: number; delay: number; play: boolean }) {
  const m = text.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/)
  const [shown, setShown] = useState<string | null>(null)
  const raf = useRef(0)
  useEffect(() => {
    if (!m || !play || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      setShown(null) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    const target = parseFloat(m[2]!.replace(/,/g, ''))
    const decimals = (m[2]!.split('.')[1] ?? '').length
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const eased = 1 - (1 - t) ** 3
      const v = target * eased
      setShown(`${m[1]}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}`)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else setShown(null)
    }
    setShown(`${m[1]}0${m[3]}`)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, play, duration, delay])
  return <>{shown ?? text}</>
}

export interface ViewProps {
  /** play entrance animations (present mode / share viewer / preview). Editing surfaces leave this off. */
  play?: boolean
}

/** How an element is drawn when its slide's object effects are played by a SlidePlayer (motion/player.ts): inside a marked wrapper, hidden from the start when its first effect is an entrance. */
export interface EffectView { hidden: boolean; /** the finest way a text of this element is played in parts ('word' also marks paragraphs, 'letter' also words) */ parts?: 'paragraph' | 'word' | 'letter' }

/** Words (and letters) of a run as marked inline-block parts, so an effect can play them one after the other. Spaces stay plain text so the line breaks where it always did. */
function splitParts(text: string, level: 'word' | 'letter'): ReactNode[] {
  return text.split(/(\s+)/).map((w, i) => {
    if (w === '' || /^\s+$/.test(w)) return w
    return <span key={i} data-pt-part="w" style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>{level === 'letter' ? Array.from(w).map((c, k) => <span key={k} data-pt-part="l" style={{ display: 'inline-block' }}>{c}</span>) : w}</span>
  })
}

/** CSS logical alignment: identical to left/right for left-to-right text, mirrored for right-to-left paragraphs. */
const ALIGN_LOGICAL = TEXT_ALIGN_CSS

export function ElementView({ el: given, theme, slide, play = false, fx }: { el: SlideElement; theme: Theme; slide: Slide; fx?: EffectView | undefined } & ViewProps) {
  const el = given.rotation && !canRotate(given) ? { ...given, rotation: 0 } : given // charts and tables are drawn upright, as PowerPoint draws them
  if (el.hidden) return null // an object switched off in the Selection pane is not drawn anywhere (editor, Present mode, the share link, thumbnails, Morph)
  // the theme as THIS slide shows it (its own brand, then its own look: theme/slide-theme.ts) for fonts and the colour table; resolveColor takes the DECK theme + slide itself
  const st = slideTheme(theme, slide)
  const colors = st.colors as Record<string, string>
  // Animations use `transform`, which would clobber a rotation — so an animated, rotated element gets a positioned wrapper that
  // plays the animation, and the element itself sits at 0,0 inside it carrying the rotation.
  const turned = transformOf(el) // its turn and its mirroring (packages/validation rotation.ts): the same everywhere it is drawn
  const rotAnim = !!(el.animation && play && turned) || !!fx // an element with object effects always sits in the wrapper, which the player animates
  const base: CSSProperties = { position: 'absolute', left: rotAnim ? 0 : el.x, top: rotAnim ? 0 : el.y, width: el.width, height: el.height, ...(rotAnim ? {} : { zIndex: el.zIndex }), transform: turned, opacity: el.opacity, ['--pt-op' as string]: el.opacity, ...(el.decorative ? { pointerEvents: 'none' } : {}) }
  const a = (extra = 0) => (rotAnim ? {} : anim(el.animation, play, extra)) // the wrapper plays it instead
  const wrap = (node: ReactNode) => (rotAnim ? <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} {...(fx ? { 'data-pt-el': el.id } : {})} style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex, ['--pt-op' as string]: el.opacity, ...(el.decorative ? { pointerEvents: 'none' as const } : {}), ...(fx?.hidden ? { visibility: 'hidden' as const } : {}), ...anim(el.animation, play) }}>{node}</div> : node)

  switch (el.type) {
    case 'text': {
      const heading = HEADING_ROLES.has(el.role)
      const weight = textBaseWeight(el)
      const byP = !!el.animation?.byParagraph && play
      const style: CSSProperties = {
        ...base, display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign], textAlign: ALIGN_LOGICAL[el.align], // 'start' keeps left-to-right text on the left and puts right-to-left text (Arabic, Hebrew, Urdu…) on the right
        color: resolveColor(el.color, theme, slide), fontSize: el.fontSize, lineHeight: el.lineHeight ?? 1.3, fontFamily: `'${heading ? st.fonts.heading : st.fonts.body}', system-ui, sans-serif`,
        fontWeight: weight, fontStyle: el.role === 'quote' ? 'italic' : undefined, overflowWrap: 'anywhere',
        ...(el.uppercase ? { textTransform: 'uppercase' as const } : {}), ...(el.letterSpacing ? { letterSpacing: el.letterSpacing } : {}),
        // effects of the whole box (text-effects.ts): a shadow under the letters, an outline round them (centred on their edges, as PowerPoint draws it)
        ...(el.textShadow ? { textShadow: textShadowCss(el.textShadow) } : {}),
        ...(el.textOutline ? { WebkitTextStroke: `${el.textOutline.width}px ${resolveColor(el.textOutline.color, theme, slide)}` } : {}),
        ...(byP ? {} : a()),
      }
      const isCount = el.animation?.type === 'count-up'
      return wrap(
        <div style={style} data-pt-text={el.role} {...(el.animation && play ? { 'data-pt-anim': '' } : {})}>
          {el.paragraphs.map((p, i) => (
            <div key={i} {...(byP ? { 'data-pt-anim': '' } : {})} {...(fx?.parts ? { 'data-pt-part': 'p' } : {})} style={{ marginBottom: i < el.paragraphs.length - 1 ? el.fontSize * (el.paraGap ?? 0.5) : 0, unicodeBidi: 'plaintext', paddingInlineStart: p.list && p.runs.some((r) => r.text !== '') ? el.fontSize * 0.9 : 0, position: 'relative', // each paragraph reads in the direction of its own first strong letter
          ...(byP ? anim(el.animation, true, i * (el.animation?.stagger ?? 100)) : {}) }}>
              {p.list && p.runs.some((r) => r.text !== '') /* an empty line draws no bullet or number (PowerPoint does the same), so a new slide's empty text box shows nothing */ && <span style={{ position: 'absolute', insetInlineStart: 0 }}>{p.list === 'bullet' ? el.bullet : `${i + 1}.`}</span>}
              {p.runs.map((r, k) => {
                const inner = isCount && play ? <CountUp text={r.text} duration={el.animation!.duration} delay={el.animation!.delay} play /> : fx?.parts === 'word' || fx?.parts === 'letter' ? splitParts(r.text, fx.parts) : r.text
                const w = runWeight(r, el), it = isRunItalic(r, el)
                const st: CSSProperties = { fontWeight: w !== weight ? w : undefined, fontStyle: it !== (el.role === 'quote') ? (it ? 'italic' : 'normal') : undefined, ...(r.underline ? { textDecoration: 'underline', textUnderlineOffset: '0.15em' } : {}), ...(r.color ? { color: resolveColor(r.color, theme, slide) } : r.highlight ? { color: highlightText(r.highlight) } : {}), ...(r.highlight ? { backgroundColor: r.highlight, boxDecorationBreak: 'clone' as const, WebkitBoxDecorationBreak: 'clone' as const } : {}) }
                return safeHref(r.link) ? (
                  <a key={k} href={safeHref(r.link)} target="_blank" rel="noopener noreferrer" style={{ ...st, color: st.color ?? 'inherit', textDecoration: 'underline', textUnderlineOffset: '0.15em' }}>{inner}</a>
                ) : (
                  <span key={k} style={st}>{inner}</span>
                )
              })}
            </div>
          ))}
        </div>,
      )
    }
    case 'shape': {
      // a shadow follows the shape's outline: it is on an OUTER frame (a clip-path on the shape itself would cut its shadow away), the shape sits at 0,0 inside it
      const shapeShadow = pictureShadowCss(el.shadow)
      const sbase: CSSProperties = shapeShadow ? { ...base, left: 0, top: 0, zIndex: 0, transform: undefined } : base
      const shade = (node: ReactNode) => (shapeShadow ? <div style={{ position: 'absolute', left: rotAnim ? 0 : el.x, top: rotAnim ? 0 : el.y, width: el.width, height: el.height, filter: shapeShadow, ...(rotAnim ? {} : { zIndex: el.zIndex }), ...(turned && !rotAnim ? { transform: turned } : {}) }}>{node}</div> : node)
      const resolve = (t: string | undefined) => (t ? (t.startsWith('#') ? t : colors[t === 'text' ? 'textPrimary' : t]) : undefined)
      const fill = el.fill === 'none' ? 'transparent' : resolve(el.fill)
      const bg = el.gradient ? gradientCss(el.gradient) : fill
      const stroke = el.stroke ? `${el.strokeWidth ?? 3}px solid ${resolve(el.stroke)}` : undefined
      const clip = el.shape === 'triangle' ? 'polygon(50% 0, 100% 100%, 0 100%)' : el.shape === 'chevron' ? 'polygon(0 0, calc(100% - 26px) 0, 100% 50%, calc(100% - 26px) 100%, 0 100%, 26px 50%)' : el.shape === 'polygon' && el.points ? `polygon(${el.points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(', ')})` : undefined
      const def = shapeDef(el.shape)
      if (def) {
        const gid = `g-${slide.id}-${el.id}` // per slide: two slides can be on screen together (a Morph, the slide rail) and may reuse an element id
        const sw = el.stroke ? (el.strokeWidth ?? 3) : 0
        return wrap(shade(
          <svg {...(el.animation && play ? { 'data-pt-anim': '' } : {})} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ ...sbase, overflow: 'visible', ...a() }}>
            {el.gradient && <defs><GradientDef id={gid} g={el.gradient} /></defs>}
            <path d={def.path} fillRule="evenodd" fill={el.gradient ? `url(#${gid})` : fill} stroke={sw ? resolve(el.stroke) : 'none'} strokeWidth={sw} strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={dashArray(el.strokeDash, sw)} />
          </svg>,
        ))
      }
      // an outline is drawn along the shape itself (a border on a clipped box lost most of a triangle's or a chevron's outline), centred on it as PowerPoint draws it, and dashed or
      // dotted with PowerPoint's proportions; a dashed line is a real line. Shapes with no outline keep their plain drawing.
      const outline = el.shape === 'line' ? !!el.strokeDash : el.shape === 'ring' ? !!el.strokeDash : !!el.stroke && (el.strokeWidth ?? 3) > 0
      if (outline) {
        const W = el.width, H = el.height, gid = `g-${slide.id}-${el.id}`
        const lw = el.shape === 'line' ? H : (el.strokeWidth ?? 3)
        const color = el.shape === 'line' ? fill : el.shape === 'ring' ? (resolve(el.stroke) ?? fill) : resolve(el.stroke)
        const paint = { fill: el.shape === 'line' || el.shape === 'ring' ? 'none' : el.gradient ? `url(#${gid})` : fill, stroke: color, strokeWidth: lw, strokeDasharray: dashArray(el.strokeDash, lw), strokeLinejoin: 'miter' as const }
        const r = Math.min(el.radius, W / 2, H / 2), n = Math.min(26, W / 2)
        const geo = el.shape === 'line' ? <line x1={0} y1={H / 2} x2={W} y2={H / 2} {...paint} />
          : el.shape === 'ellipse' || el.shape === 'ring' ? <ellipse cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2} {...paint} />
          : el.shape === 'triangle' ? <polygon points={`${W / 2},0 ${W},${H} 0,${H}`} {...paint} />
          : el.shape === 'chevron' ? <polygon points={`0,0 ${W - n},0 ${W},${H / 2} ${W - n},${H} 0,${H} ${n},${H / 2}`} {...paint} />
          : el.shape === 'polygon' && el.points ? <polygon points={el.points.map(([x, y]) => `${x * W},${y * H}`).join(' ')} {...paint} />
          : <rect x={0} y={0} width={W} height={H} rx={r} ry={r} {...paint} />
        return wrap(shade(
          <svg {...(el.animation && play ? { 'data-pt-anim': '' } : {})} viewBox={`0 0 ${W} ${H}`} style={{ ...sbase, overflow: 'visible', ...a() }}>
            {el.gradient && <defs><GradientDef id={gid} g={el.gradient} /></defs>}
            {geo}
          </svg>,
        ))
      }
      return wrap(shade(
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...sbase, background: el.shape === 'ring' ? 'transparent' : bg, border: el.shape === 'ring' ? `${el.strokeWidth ?? 3}px solid ${resolve(el.stroke) ?? fill}` : stroke, borderRadius: el.shape === 'ellipse' || el.shape === 'ring' ? '50%' : el.radius, clipPath: clip, boxSizing: 'border-box', ...a() }} />,
      ))
    }
    case 'image': {
      if (!el.src) {
        // Unresolved image: clearly a placeholder, never a broken image
        return wrap(
          <div role="img" aria-label={el.alt} style={{ ...base, borderRadius: theme.radius, background: `linear-gradient(135deg, ${colors['surface']}, ${colors['secondary']}33)`, border: `3px dashed ${colors['textSecondary']}55`, display: 'grid', placeItems: 'center', padding: 40, textAlign: 'center', color: colors['textSecondary'], fontFamily: st.fonts.body, fontSize: 28 }}>
            <div>🖼<div style={{ marginTop: 12 }}>{el.alt}</div></div>
          </div>
        )
      }
      // Photo crops: the wrapper clips (circle / arch / angled / rounded), the <img> may Ken-Burns inside it, the overlay washes over it.
      const arch = el.clip === 'arch' ? `inset(0 round ${el.width / 2}px ${el.width / 2}px 0 0)` : undefined
      const clipPath = el.clip === 'arch' ? arch : CLIP_PATH[el.clip]
      const ambient = el.animation?.type === 'kenburns'
      const wrapAnim = ambient || (clipPath && el.animation?.type === 'wipe') ? {} : a() // a clip-path wipe would erase the crop shape
      const shadowCss = pictureShadowCss(el.shadow)
      // the colour (black and white, saturation, warmth) is one matrix, shared with the exporter; drawn by an SVG filter next to the picture
      const colour = pictureColorMatrix(el.filter)
      // the filter's id carries a fingerprint of its numbers: the same slide drawn twice (stage, slide rail, a Morph) defines it twice, and the page uses the FIRST one;
      // with the numbers in the id, a copy that is a moment behind (a thumbnail while a slider moves) can never lend its old filter to another
      const colourId = `pt-pc-${slide.id}-${el.id}-${fingerprint(`${el.filter?.blur ?? 0}|${el.filter?.grayscale ?? 0}|${el.filter?.saturation ?? 1}|${el.filter?.warmth ?? 0}`)}`.replace(/[^A-Za-z0-9_-]/g, '')
      const filterCss = pictureFilterCss(el.filter, colourId)
      // a soft-focus blur (its edges stay solid: the picture is extended, as the exporter's blur does, never faded to see-through)
      const blur = el.filter?.blur ?? 0
      // a border: a stroke twice as wide along the frame's own outline, the clip cuts the outer half (validation picture.ts pictureOutline, the exporter draws the same)
      const outline = el.border ? pictureOutline(el.clip, el.width, el.height, el.radius ?? theme.radius) : null
      const frame = (node: ReactNode) => shadowCss ? <div style={{ position: 'absolute', left: rotAnim ? 0 : el.x, top: rotAnim ? 0 : el.y, width: el.width, height: el.height, filter: shadowCss, ...(rotAnim ? {} : { zIndex: el.zIndex }), ...(turned && !rotAnim ? { transform: turned } : {}) }}>{node}</div> : node
      return wrap(frame(
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, ...(shadowCss ? { left: 0, top: 0, zIndex: 0, transform: undefined } : {}), overflow: 'hidden', borderRadius: el.clip === 'circle' ? '50%' : (el.radius ?? theme.radius), clipPath, ...wrapAnim }}>
          {(colour || blur > 0) && <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}><filter id={colourId} colorInterpolationFilters="sRGB">{blur > 0 && <feGaussianBlur stdDeviation={blur} edgeMode="duplicate" />}{colour && <feColorMatrix type="matrix" values={colorMatrixValues(colour)} />}</filter></svg>}
          <Picture {...(isCropped(el.crop) ? { crop: el.crop } : {})} look={{ ...(isCropped(el.crop) ? {} : pictureZoomCss(el.zoom, el.focus)), ...(filterCss ? { filter: filterCss } : {}) }} src={el.src} alt={el.alt} eager={!!fx} fit={el.fit} tile={`linear-gradient(135deg, ${colors['surface']}, ${colors['secondary']}22)`} {...(ambient && play ? { animated: true } : {})} {...(ambient ? { extra: a() } : {})} />
          {outline && el.border && <svg aria-hidden data-pt-border="" viewBox={`0 0 ${el.width} ${el.height}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>{createElement(outline.tag, { ...outline.attrs, fill: 'none', stroke: resolveColor(el.border.color, theme, slide), strokeWidth: el.border.width * 2 })}</svg>}
          {el.overlay && <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(${el.overlay.angle}deg, ${el.overlay.from}, ${el.overlay.to})`, opacity: el.overlay.opacity }} />}
          {/* the photographer credit (Unsplash / Pexels) is stored with the picture; whether it is drawn on the slide is SHOW_PHOTO_CREDIT */}
          {SHOW_PHOTO_CREDIT && el.attribution && el.clip !== 'circle' && <div style={{ position: 'absolute', right: 10, bottom: 8, maxWidth: '90%', padding: '3px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.92)', fontFamily: st.fonts.body, fontSize: 15, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{el.attribution.source}</div>}
        </div>
      ))
    }
    case 'chart': {
      const chartOn = chartLookOn(slideBase(theme, slide).colors, slide) // (the slide's own colours and backdrop: chart-style.ts)
      return wrap(<div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, ...a() }}><Chart chartType={el.chartType} labels={el.labels} series={el.series} unit={el.unit} width={el.width} height={el.height} theme={{ ...st, colors: chartOn.colors as Theme["colors"] }} backdrop={chartOn.backdrop} colors={el.colors} legend={el.legend} trendline={el.trendline} dataLabels={el.dataLabels} stack={el.stack} /></div>)
    }
    case 'table': {
      const tk = (el.fontSize ?? 30) / 30
      const span = cellSpans(el) // merged cells (packages/validation table-merge.ts): the top-left cell spans its area, the others are not drawn
      const border = el.borderColor ? { border: `2px solid ${el.borderColor}` } : {}
      const rowBg = (ri: number) => { const f = ri % 2 ? el.altRowFill ?? 'transparent' : el.rowFill ?? colors['surface']; return f === 'none' ? 'transparent' : f }
      const spanAttrs = (sp: { rows: number; columns: number }) => ({ ...(sp.rows > 1 ? { rowSpan: sp.rows } : {}), ...(sp.columns > 1 ? { colSpan: sp.columns } : {}) })
      return wrap(
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, fontFamily: st.fonts.body, fontSize: el.fontSize ?? 30, ...a() }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: el.textColor ?? colors['textPrimary'] }}>
            <thead><tr>{el.header.map((h, i) => { const sp = span(-1, i); if (sp.covered) return null; return <th key={i} {...spanAttrs(sp)} style={{ background: el.headerFill === 'none' ? 'transparent' : el.headerFill ?? colors['primary'], color: el.headerColor ?? colors['onPrimary'], textAlign: alignOf(el, -1, i).h, verticalAlign: alignOf(el, -1, i).v, padding: `${Math.round(16 * tk)}px ${Math.round(20 * tk)}px`, fontFamily: st.fonts.heading, ...border }}>{h || '\u00A0'}</th> })}</tr></thead>
            <tbody>{el.rows.map((r, ri) => <tr key={ri} style={{ background: rowBg(ri) }}>{r.map((c, ci) => { const sp = span(ri, ci); if (sp.covered) return null; const hl = el.highlights?.find((h) => h.row === ri && h.column === ci); return <td key={ci} {...spanAttrs(sp)} style={{ textAlign: alignOf(el, ri, ci).h, verticalAlign: alignOf(el, ri, ci).v, padding: `${Math.round(14 * tk)}px ${Math.round(20 * tk)}px`, ...(sp.rows > 1 ? { background: rowBg(ri) } : {}), ...border, ...(hl ? { background: hl.fill, color: highlightText(hl.fill), fontWeight: 700 } : {}) }}>{c || '\u00A0'}</td> })}</tr>)}</tbody>
          </table>
        </div>
      )
    }
    case 'icon': // stickers: an emoji glyph sized to its box
      return wrap(<div role="img" aria-label="sticker" {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, display: 'grid', placeItems: 'center', fontSize: Math.min(el.width, el.height) * 0.78, lineHeight: 1, ...a() }}>{el.name}</div>)
    default:
      return null // diagram element: later
  }
}

/** CSS `background` for a slide: colour, gradient or picture (shared by the editor stage, thumbnails, present mode and share viewer). */
export function backgroundCss(slide: Slide, theme: Theme): string {
  const b = slide.background
  if (b?.type === 'gradient' && b.gradient) return gradientCss(b.gradient)
  // picture background (the colour behind it shows while it loads); quotes/backslashes can't break out of url()
  // a background picture is drawn by <SlideBackground> (its own layer, so it can be softened); behind it, the deck's colour shows while it loads
  if (b?.type === 'image') return slideTheme(theme, slide).colors.background
  return b?.type === 'color' || b?.type === 'gradient' ? b.value : slideTheme(theme, slide).colors.background
}

/**
 * A slide's background picture, cover-fitted like the exporter's (packages/api picture-bake.ts backgroundPicture), optionally softened by a blur whose edges stay solid
 * (the same blur as a picture's). Its own layer under everything else: the slide's colour / gradient is the parent's CSS background (backgroundCss). `scale` = screen
 * pixels per canvas unit (the blur is in canvas units). Every place that draws a slide's background uses it: the slide, the editor's stage, Morph.
 */
export function SlideBackground({ slide, scale = 1, W = 1920, H = 1080 }: { slide: Slide; scale?: number; W?: number; H?: number }) {
  const b = slide.background
  // a pattern over a colour background: the shared drawing (validation background-pattern.ts), the exporter renders the very same SVG
  if (b?.type === 'color' && b.pattern && /^#[0-9a-f]{6}$/i.test(b.value)) {
    return <div aria-hidden data-pt-bg="pattern" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `center / 100% 100% no-repeat url("data:image/svg+xml,${encodeURIComponent(patternSvg(b.pattern, b.value, W, H))}")` }} />
  }
  const url = b?.type === 'image' ? safeBgUrl(b.value) : ''
  if (!url) return null
  const blur = b?.blur ?? 0
  const id = `pt-bgb-${slide.id}-${fingerprint(`${blur}|${scale}`)}`.replace(/[^A-Za-z0-9_-]/g, '')
  return (
    <>
      {blur > 0 && <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}><filter id={id} colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation={blur * scale} edgeMode="duplicate" /></filter></svg>}
      <div aria-hidden data-pt-bg="" style={{ position: 'absolute', inset: 0, background: `center / cover no-repeat url("${url}")`, pointerEvents: 'none', ...(blur > 0 ? { filter: `url(#${id})` } : {}) }} />
    </>
  )
}

export interface FooterInfo {
  index: number
  total: number
  title: string
}

/** Footer is drawn at view time (never stored): it stays right after reordering and honours the template's footer style. */
/** the deck footer (slide number, deck name) as every view draws it: the slideshow, the share page, the rail and the editor's own canvas */
export function Footer({ info, theme, slide, W, H, M }: { info: FooterInfo; theme: Theme; slide: Slide; W: number; H: number; M: number }) {
  const st = slideTheme(theme, slide) // (the slide's own brand fonts and colours)
  const mode = theme.style?.footer ?? 'none'
  if (mode === 'none' || slide.layoutId === 'title') return null
  const bg = slide.background?.type === 'color' ? slide.background.value : st.colors.background
  const dark = parseInt(bg.slice(1, 3), 16) * 0.299 + parseInt(bg.slice(3, 5), 16) * 0.587 + parseInt(bg.slice(5, 7), 16) * 0.114 < 128
  const color = dark ? 'rgba(255,255,255,0.7)' : st.colors.textSecondary
  const common: CSSProperties = { position: 'absolute', top: H - M * 0.55 - 14, fontFamily: st.fonts.body, fontSize: 22, color, letterSpacing: 1, zIndex: 9000 }
  return (
    <div aria-hidden>
      {mode === 'brand' && <div style={{ ...common, left: M, maxWidth: W * 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{theme.style?.footerText || info.title}</div>}
      <div style={{ ...common, right: M }}>{String(info.index + 1).padStart(2, '0')} <span style={{ opacity: 0.5 }}>/ {String(info.total).padStart(2, '0')}</span></div>
    </div>
  )
}

/** A slide generation has not written yet: its planned title and a soft moving shimmer (still when the person asks for reduced motion). */
function WritingPlaceholder({ title, theme, W, H }: { title: string; theme: Theme; W: number; H: number }) {
  return (
    <div data-writing="true" role="status" aria-label={title ? `Writing: ${title}` : 'Writing this slide'} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: H * 0.04, padding: W * 0.08, textAlign: 'center' }}>
      <style>{`@keyframes pt-writing{0%{background-position:200% 0}100%{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){[data-writing-bar]{animation:none!important}}`}</style>
      {title && <div style={{ fontFamily: `'${theme.fonts.heading}', system-ui, sans-serif`, fontWeight: 700, fontSize: H * 0.07, lineHeight: 1.2, color: theme.colors.textPrimary, opacity: 0.85 }}>{title}</div>}
      {[0.6, 0.45, 0.52].map((w, i) => (
        <div key={i} data-writing-bar="" style={{ width: `${w * 100}%`, height: H * 0.035, borderRadius: H * 0.02, backgroundImage: `linear-gradient(90deg, ${theme.colors.textSecondary}22 25%, ${theme.colors.textSecondary}44 50%, ${theme.colors.textSecondary}22 75%)`, backgroundSize: '200% 100%', animation: 'pt-writing 1.6s linear infinite' }} />
      ))}
    </div>
  )
}

/** The "Made with SlidesDone" pill: drawn at view time from the plan (never part of the document), so a Morph overlay shows it too. */
export function Watermark() {
  return (
    <div aria-hidden style={{ position: 'absolute', right: 32, bottom: 24, zIndex: 9999, padding: '10px 20px', borderRadius: 999, background: 'rgba(15,23,42,0.78)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: 0.3 }}>
      Made with SlidesDone
    </div>
  )
}

export interface SlideCanvasProps extends ViewProps {
  /** the slide's object effects are played by a SlidePlayer: its elements with effects are drawn ready for it, and the theme's automatic entrance steps aside (ambient loops such as Ken Burns keep running) */
  effects?: boolean
  slide: Slide
  theme: Theme
  aspect: AspectRatio
  width: number
  watermark?: boolean
  footer?: FooterInfo
}

/**
 * A picture. When it cannot be loaded (a stock photo that was taken down, a link that died) it is drawn as a quiet tile of the design's colours instead of the browser's broken-image
 * icon: thumbnails, Present, the shared view and every export all look intentional. The editor says what happened and offers a replacement (EditorCanvas, its own layer).
 */
function Picture({ src, alt, eager, fit, tile, animated, extra, look, crop }: { src: string; alt: string; eager: boolean; fit: 'cover' | 'contain'; tile: string; animated?: boolean; extra?: CSSProperties; look?: CSSProperties; crop?: PictureCrop }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === src) return <div role="img" aria-label={alt} data-pt-broken="" style={{ width: '100%', height: '100%', background: tile }} />
  return <img src={src} alt={alt} referrerPolicy="no-referrer" loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(src)} {...(animated ? { 'data-pt-anim': '' } : {})} style={crop ? { display: 'block', ...cropImgCss(crop), ...(look ?? {}), ...(extra ?? {}) } : { width: '100%', height: '100%', display: 'block', objectFit: fit, ...(look ?? {}), ...(extra ?? {}) }} />
}

/** a short, stable fingerprint of a string (for ids that must differ when the values differ) */
function fingerprint(t: string): string { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }

/** A shape's two-colour gradient for SVG: linear along its angle, or radial from the middle to the corners (r = √½ of the box: the same ellipse as CSS's radial-gradient and the exporter's picture) */
function GradientDef({ id, g }: { id: string; g: { from: string; to: string; angle: number; kind?: 'linear' | 'radial' | undefined } }) {
  const stops = <><stop offset="0" stopColor={g.from} /><stop offset="1" stopColor={g.to} /></>
  return g.kind === 'radial' ? <radialGradient id={id} cx=".5" cy=".5" r=".7071">{stops}</radialGradient> : <linearGradient id={id} gradientTransform={`rotate(${g.angle - 90} .5 .5)`}>{stops}</linearGradient>
}

/** Renders a slide at its native canvas size, scaled to `width`. A pure view of the JSON document. */
export function SlideCanvas({ slide, theme, aspect, width, watermark = false, footer, play = false, effects = false }: SlideCanvasProps) {
  useMotionCss()
  const scripted = effects && !!slide.effects?.length
  // the elements that carry effects, and those whose click triggers one (they need the marked wrapper too), and how each text is split into parts
  const fxIds = useMemo(() => (scripted ? new Set(slide.effects!.flatMap((e) => (e.trigger ? [e.elementId, e.trigger] : [e.elementId]))) : null), [scripted, slide.effects])
  const partsOf = useMemo(() => {
    const rank = { paragraph: 1, word: 2, letter: 3 } as const
    const m = new Map<string, 'paragraph' | 'word' | 'letter'>()
    if (scripted) for (const e of slide.effects!) if (e.textBy && e.textBy !== 'object' && rank[e.textBy] > (m.has(e.elementId) ? rank[m.get(e.elementId)!] : 0)) m.set(e.elementId, e.textBy)
    return m
  }, [scripted, slide.effects])
  const hidden = useMemo(() => (scripted ? hiddenAtStart(slide) : null), [scripted, slide])
  const own = slideTheme(theme, slide) // (a slide with its own brand loads its own fonts)
  useEffect(() => ensureFonts([own.fonts.heading, own.fonts.body]), [own.fonts.heading, own.fonts.body])
  const { width: W, height: H } = CANVAS[aspect]
  const scale = width / W
  const M = Math.round(W * 0.05)
  return (
    <div style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', isolation: 'isolate', background: backgroundCss(slide, theme), borderRadius: 4 }}>
      <SlideBackground slide={slide} scale={scale} W={W} H={H} />
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
        {slide.writing && <WritingPlaceholder title={slide.writing.title} theme={own} W={W} H={H} />}
        {slide.elements.map((el) => {
          // in a slide played by effects, the theme's entrance would fight the effects: only the ambient loops stay
          const own = scripted && el.animation && !AMBIENT.has(el.animation.type) ? withoutAnimation(el) : el
          return <ElementView key={el.id} el={own} theme={theme} slide={slide} play={play} fx={fxIds?.has(el.id) ? { hidden: !!hidden?.has(el.id), ...(partsOf.has(el.id) ? { parts: partsOf.get(el.id)! } : {}) } : undefined} />
        })}
        {footer && <Footer info={footer} theme={theme} slide={slide} W={W} H={H} M={M} />}
        {/* View-time overlay driven by the plan, NOT stored in the document: upgrading removes it everywhere instantly. */}
        {watermark && <Watermark />}
      </div>
    </div>
  )
}

/** Fills its container's width (ResizeObserver). Reserves the slide's height up front, so remounting (next slide) never collapses and re-grows the page. */
export function FitSlide(props: Omit<SlideCanvasProps, 'width'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { width, height } = CANVAS[props.aspect]
  return <div ref={ref} style={{ width: '100%', aspectRatio: `${width} / ${height}` }}>{w > 0 && <SlideCanvas {...props} width={w} />}</div>
}

/** CSS animation props for the slide TRANSITION wrapper (present mode / share viewer). */
export function transitionStyle(slide: Slide, fallback: string | undefined): CSSProperties {
  const chosen = slide.transition?.type ?? fallback ?? 'none'
  const t = chosen === 'morph' ? 'fade' : chosen // a page that cannot play a Morph (it has no outgoing slide to match) fades instead
  if (t === 'none') return {}
  // the stored direction says where a slide / push / wipe comes from; the base keyframes are the default (slide and push from the right, wipe from the left)
  const d = slide.transition?.direction
  const def = t === 'wipe' ? 'left' : 'right'
  const name = (t === 'slide' || t === 'push' || t === 'wipe') && d && d !== def ? `${t}-${d}` : t
  // the chosen speed curve (the Transitions ribbon's Easing); none chosen = the soft ease-out every transition had
  const curve = slide.transition?.easing ? easingCss(slide.transition.easing) : 'cubic-bezier(.2,.7,.2,1)'
  return { animation: `pt-t-${name} ${slide.transition?.duration ?? 500}ms ${curve} both` }
}
