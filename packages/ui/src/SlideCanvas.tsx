import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CANVAS, type Animation, type AspectRatio, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { resolveColor } from '@prompttoppt/theme'
import { MOTION_CSS } from './animations.css'
import { Chart } from './charts'
import { ensureFonts } from './fonts'

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
  diagonal: 'polygon(16% 0, 100% 0, 84% 100%, 0 100%)',
  'diagonal-flip': 'polygon(0 0, 84% 0, 100% 100%, 16% 100%)',
  hex: 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)',
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

export function ElementView({ el, theme, slide, play = false }: { el: SlideElement; theme: Theme; slide: Slide } & ViewProps) {
  const colors = { ...theme.colors, ...slide.themeOverrides } as Record<string, string>
  // Animations use `transform`, which would clobber a rotation — so an animated, rotated element gets a positioned wrapper that
  // plays the animation, and the element itself sits at 0,0 inside it carrying the rotation.
  const rotAnim = !!(el.animation && play && el.rotation)
  const base: CSSProperties = { position: 'absolute', left: rotAnim ? 0 : el.x, top: rotAnim ? 0 : el.y, width: el.width, height: el.height, ...(rotAnim ? {} : { zIndex: el.zIndex }), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined, opacity: el.opacity, ['--pt-op' as string]: el.opacity, ...(el.decorative ? { pointerEvents: 'none' } : {}) }
  const a = (extra = 0) => (rotAnim ? {} : anim(el.animation, play, extra)) // the wrapper plays it instead
  const wrap = (node: ReactNode) => (rotAnim ? <div data-pt-anim style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: el.zIndex, ['--pt-op' as string]: el.opacity, ...(el.decorative ? { pointerEvents: 'none' as const } : {}), ...anim(el.animation, play) }}>{node}</div> : node)

  switch (el.type) {
    case 'text': {
      const heading = HEADING_ROLES.has(el.role)
      const weight = el.weight ?? (el.role === 'title' || el.role === 'metric' ? 800 : heading ? 700 : 400)
      const byP = !!el.animation?.byParagraph && play
      const style: CSSProperties = {
        ...base, display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign], textAlign: el.align,
        color: resolveColor(el.color, theme, slide), fontSize: el.fontSize, lineHeight: el.lineHeight ?? 1.3, fontFamily: `'${heading ? theme.fonts.heading : theme.fonts.body}', system-ui, sans-serif`,
        fontWeight: weight, fontStyle: el.role === 'quote' ? 'italic' : undefined, overflowWrap: 'anywhere',
        ...(el.uppercase ? { textTransform: 'uppercase' as const } : {}), ...(el.letterSpacing ? { letterSpacing: el.letterSpacing } : {}),
        ...(byP ? {} : a()),
      }
      const isCount = el.animation?.type === 'count-up'
      return wrap(
        <div style={style} {...(el.animation && play ? { 'data-pt-anim': '' } : {})}>
          {el.paragraphs.map((p, i) => (
            <div key={i} {...(byP ? { 'data-pt-anim': '' } : {})} style={{ marginBottom: i < el.paragraphs.length - 1 ? el.fontSize * (el.paraGap ?? 0.5) : 0, paddingLeft: p.list ? el.fontSize * 0.9 : 0, position: 'relative', ...(byP ? anim(el.animation, true, i * (el.animation?.stagger ?? 100)) : {}) }}>
              {p.list && <span style={{ position: 'absolute', left: 0 }}>{p.list === 'bullet' ? el.bullet : `${i + 1}.`}</span>}
              {p.runs.map((r, k) => {
                const inner = isCount && play ? <CountUp text={r.text} duration={el.animation!.duration} delay={el.animation!.delay} play /> : r.text
                const st: CSSProperties = { fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined, ...(r.color ? { color: resolveColor(r.color, theme, slide) } : {}) }
                return safeHref(r.link) ? (
                  <a key={k} href={safeHref(r.link)} target="_blank" rel="noopener noreferrer" style={{ ...st, color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '0.15em' }}>{inner}</a>
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
      const resolve = (t: string | undefined) => (t ? (t.startsWith('#') ? t : colors[t === 'text' ? 'textPrimary' : t]) : undefined)
      const fill = el.fill === 'none' ? 'transparent' : resolve(el.fill)
      const bg = el.gradient ? `linear-gradient(${el.gradient.angle}deg, ${el.gradient.from}, ${el.gradient.to})` : fill
      const stroke = el.stroke ? `${el.strokeWidth ?? 3}px solid ${resolve(el.stroke)}` : undefined
      const clip = el.shape === 'triangle' ? 'polygon(50% 0, 100% 100%, 0 100%)' : el.shape === 'chevron' ? 'polygon(0 0, calc(100% - 26px) 0, 100% 50%, calc(100% - 26px) 100%, 0 100%, 26px 50%)' : undefined
      return wrap(
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, background: el.shape === 'ring' ? 'transparent' : bg, border: el.shape === 'ring' ? `${el.strokeWidth ?? 3}px solid ${resolve(el.stroke) ?? fill}` : stroke, borderRadius: el.shape === 'ellipse' || el.shape === 'ring' ? '50%' : el.radius, clipPath: clip, boxSizing: 'border-box', ...a() }} />,
      )
    }
    case 'image': {
      if (!el.src) {
        // Unresolved image: clearly a placeholder, never a broken image
        return (
          <div role="img" aria-label={el.alt} style={{ ...base, borderRadius: theme.radius, background: `linear-gradient(135deg, ${colors['surface']}, ${colors['secondary']}33)`, border: `3px dashed ${colors['textSecondary']}55`, display: 'grid', placeItems: 'center', padding: 40, textAlign: 'center', color: colors['textSecondary'], fontFamily: theme.fonts.body, fontSize: 28 }}>
            <div>🖼<div style={{ marginTop: 12 }}>{el.alt}</div></div>
          </div>
        )
      }
      // Photo crops: the wrapper clips (circle / arch / angled / rounded), the <img> may Ken-Burns inside it, the overlay washes over it.
      const arch = el.clip === 'arch' ? `inset(0 round ${el.width / 2}px ${el.width / 2}px 0 0)` : undefined
      const clipPath = el.clip === 'arch' ? arch : CLIP_PATH[el.clip]
      const ambient = el.animation?.type === 'kenburns'
      const wrapAnim = ambient || (clipPath && el.animation?.type === 'wipe') ? {} : a() // a clip-path wipe would erase the crop shape
      return (
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, overflow: 'hidden', borderRadius: el.clip === 'circle' ? '50%' : (el.radius ?? theme.radius), clipPath, ...wrapAnim }}>
          <img src={el.src} alt={el.alt} referrerPolicy="no-referrer" loading="lazy" {...(ambient && play ? { 'data-pt-anim': '' } : {})} style={{ width: '100%', height: '100%', display: 'block', objectFit: el.fit, ...(ambient ? a() : {}) }} />
          {el.overlay && <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(${el.overlay.angle}deg, ${el.overlay.from}, ${el.overlay.to})`, opacity: el.overlay.opacity }} />}
          {/* stock photos must credit their photographer (Unsplash / Pexels licence terms) */}
          {el.attribution && el.clip !== 'circle' && <div style={{ position: 'absolute', right: 10, bottom: 8, maxWidth: '90%', padding: '3px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.92)', fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{el.attribution.source}</div>}
        </div>
      )
    }
    case 'chart':
      return <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, ...a() }}><Chart chartType={el.chartType} labels={el.labels} series={el.series} unit={el.unit} width={el.width} height={el.height} theme={theme} /></div>
    case 'table':
      return (
        <div {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, fontFamily: theme.fonts.body, fontSize: 30, ...a() }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: colors['textPrimary'] }}>
            <thead><tr>{el.header.map((h, i) => <th key={i} style={{ background: colors['primary'], color: colors['onPrimary'], textAlign: 'left', padding: '16px 20px', fontFamily: theme.fonts.heading }}>{h}</th>)}</tr></thead>
            <tbody>{el.rows.map((r, ri) => <tr key={ri} style={{ background: ri % 2 ? 'transparent' : colors['surface'] }}>{r.map((c, ci) => <td key={ci} style={{ padding: '14px 20px' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    case 'icon': // stickers: an emoji glyph sized to its box
      return <div role="img" aria-label="sticker" {...(el.animation && play ? { 'data-pt-anim': '' } : {})} style={{ ...base, display: 'grid', placeItems: 'center', fontSize: Math.min(el.width, el.height) * 0.78, lineHeight: 1, ...a() }}>{el.name}</div>
    default:
      return null // diagram element: later
  }
}

/** CSS `background` for a slide: colour, gradient or picture (shared by the editor stage, thumbnails, present mode and share viewer). */
export function backgroundCss(slide: Slide, theme: Theme): string {
  const b = slide.background
  if (b?.type === 'gradient' && b.gradient) return `linear-gradient(${b.gradient.angle}deg, ${b.gradient.from}, ${b.gradient.to})`
  // picture background (the colour behind it shows while it loads); quotes/backslashes can't break out of url()
  if (b?.type === 'image') return safeBgUrl(b.value) ? `center / cover no-repeat url("${safeBgUrl(b.value)}"), ${theme.colors.background}` : theme.colors.background
  return b?.type === 'color' || b?.type === 'gradient' ? b.value : theme.colors.background
}

export interface FooterInfo {
  index: number
  total: number
  title: string
}

/** Footer is drawn at view time (never stored): it stays right after reordering and honours the template's footer style. */
function Footer({ info, theme, slide, W, H, M }: { info: FooterInfo; theme: Theme; slide: Slide; W: number; H: number; M: number }) {
  const mode = theme.style?.footer ?? 'none'
  if (mode === 'none' || slide.layoutId === 'title') return null
  const bg = slide.background?.type === 'color' ? slide.background.value : theme.colors.background
  const dark = parseInt(bg.slice(1, 3), 16) * 0.299 + parseInt(bg.slice(3, 5), 16) * 0.587 + parseInt(bg.slice(5, 7), 16) * 0.114 < 128
  const color = dark ? 'rgba(255,255,255,0.7)' : theme.colors.textSecondary
  const common: CSSProperties = { position: 'absolute', top: H - M * 0.55 - 14, fontFamily: theme.fonts.body, fontSize: 22, color, letterSpacing: 1, zIndex: 9000 }
  return (
    <div aria-hidden>
      {mode === 'brand' && <div style={{ ...common, left: M, maxWidth: W * 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.title}</div>}
      <div style={{ ...common, right: M }}>{String(info.index + 1).padStart(2, '0')} <span style={{ opacity: 0.5 }}>/ {String(info.total).padStart(2, '0')}</span></div>
    </div>
  )
}

export interface SlideCanvasProps extends ViewProps {
  slide: Slide
  theme: Theme
  aspect: AspectRatio
  width: number
  watermark?: boolean
  footer?: FooterInfo
}

/** Renders a slide at its native canvas size, scaled to `width`. A pure view of the JSON document. */
export function SlideCanvas({ slide, theme, aspect, width, watermark = false, footer, play = false }: SlideCanvasProps) {
  useMotionCss()
  useEffect(() => ensureFonts([theme.fonts.heading, theme.fonts.body]), [theme.fonts.heading, theme.fonts.body])
  const { width: W, height: H } = CANVAS[aspect]
  const scale = width / W
  const M = Math.round(W * 0.05)
  return (
    <div style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', isolation: 'isolate', background: backgroundCss(slide, theme), borderRadius: 4 }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
        {slide.elements.map((el) => <ElementView key={el.id} el={el} theme={theme} slide={slide} play={play} />)}
        {footer && <Footer info={footer} theme={theme} slide={slide} W={W} H={H} M={M} />}
        {/* View-time overlay driven by the plan, NOT stored in the document: upgrading removes it everywhere instantly. */}
        {watermark && (
          <div aria-hidden style={{ position: 'absolute', right: 32, bottom: 24, zIndex: 9999, padding: '10px 20px', borderRadius: 999, background: 'rgba(15,23,42,0.78)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: 0.3 }}>
            Made with promptToPpt
          </div>
        )}
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
  const t = slide.transition?.type ?? fallback ?? 'none'
  if (t === 'none') return {}
  return { animation: `pt-t-${t} ${slide.transition?.duration ?? 500}ms cubic-bezier(.2,.7,.2,1) both` }
}
