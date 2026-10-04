import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { SAMPLES, THEMES, composeSlide } from '@prompttoppt/theme'
import { SlideCanvas } from '@prompttoppt/ui'
import type { AspectRatio, Slide, Theme, ThemeStyle } from '@prompttoppt/validation'

const KITS: { name: string; theme: { style: Partial<ThemeStyle> } }[] = [
  { name: 'split + underline + shadow cards + circles', theme: { style: { title: 'split', header: 'underline', card: 'shadow', decor: 'circles', titleBackground: 'gradient' } } },
  { name: 'center + dot + outline + rings', theme: { style: { title: 'center', header: 'dot', card: 'outline', decor: 'rings', titleBackground: 'dark', headingWeight: 700 } } },
  { name: 'band + side + accent-left + dots (tint body)', theme: { style: { title: 'band', header: 'side', card: 'accent-left', decor: 'dots', bodyBackground: 'tint', footer: 'number' } } },
  { name: 'stack + rule + tint + diagonal (uppercase)', theme: { style: { title: 'stack', header: 'rule', card: 'tint', decor: 'diagonal', uppercaseHeadings: true, headingTracking: 2, headingWeight: 900, titleBackground: 'dark', footer: 'brand' } } },
  { name: 'minimal + none + flat + corner', theme: { style: { title: 'minimal', header: 'none', card: 'flat', decor: 'corner', headingWeight: 700 } } },
  { name: 'frame + bar + accent-top + blobs (gradient body)', theme: { style: { title: 'frame', header: 'bar', card: 'accent-top', decor: 'blobs', bodyBackground: 'gradient', titleBackground: 'gradient' } } },
]
const SHOW = ['title', 'title-body', 'metrics', 'roadmap', 'architecture', 'case-study', 'agenda', 'team', 'matrix', 'big-number', 'process', 'comparison']

/** DEV-ONLY visual check of the layout engine. Not routed in production builds. */
export function DevGallery() {
  const [p] = useSearchParams()
  const aspect = (p.get('aspect') as AspectRatio) ?? '16:9'
  const kitIdx = Number(p.get('kit') ?? 0)
  const themeIdx = Number(p.get('theme') ?? 0)
  const play = p.get('play') === '1'
  const kit = KITS[kitIdx] ?? KITS[0]!
  const theme: Theme = useMemo(() => ({ ...THEMES[themeIdx]!, style: { ...THEMES[0]!.style, ...kit.theme.style } as ThemeStyle, motion: { transition: 'fade', entrance: 'fade-up', stagger: 120, duration: 600 } }), [kit, themeIdx])
  const slides = useMemo(() => SHOW.map((l) => ({ id: l, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(SAMPLES.find((s: { layout: string }) => s.layout === l)!, theme, aspect) }) as Slide), [theme, aspect])
  return (
    <div style={{ padding: 24, background: '#e5e7eb', minHeight: '100vh' }}>
      <h1 style={{ font: '700 20px Inter' }}>{kit.name} · theme {THEMES[themeIdx]!.id} · {aspect}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: aspect === '1:1' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 20, marginTop: 16 }}>
        {slides.map((s, i) => (
          <div key={s.id}><div style={{ font: '12px Inter', color: '#475569', marginBottom: 4 }}>{s.layoutId}</div><SlideCanvas slide={s} theme={theme} aspect={aspect} width={aspect === '1:1' ? 330 : 440} play={play} footer={{ index: i, total: slides.length, title: 'Deck title' }} /></div>
        ))}
      </div>
    </div>
  )
}
