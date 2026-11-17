import { useEffect } from 'react'
import { MORPH_DEFAULTS } from '@prompttoppt/validation'
import type { Slide } from '@prompttoppt/validation'
import { MorphLayer, SlideCanvas, easingCss, transitionStyle } from '@prompttoppt/ui'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useEntitlements } from '@/lib/entitlements'
import { CanvasPreview } from './CanvasPreview'
import { morphPreviewHandle } from './morphHandle'

/**
 * The two previews that play on the canvas in place (over the editing surface, never saved): the slide's animations, and the transition INTO this slide (a Morph plays from the
 * previous slide). They sit inside the stage, so they scale with it.
 */
export function StageOverlays({ slide, width }: { slide: Slide; width: number }) {
  const preview = useUi((s) => s.preview)
  const tp = useUi((s) => s.transitionPreview)
  const doc = useDoc((s) => s.doc)
  if (!doc) return null
  if (preview) return <CanvasPreview key={preview.run} doc={doc} slide={slide} width={width} only={preview.only} fromEffectId={preview.fromEffectId} run={preview.run} />
  if (tp) return <TransitionPreview key={tp.run} slide={slide} width={width} hold={tp.hold} />
  return null
}

function TransitionPreview({ slide, width, hold }: { slide: Slide; width: number; hold: boolean }) {
  const doc = useDoc((s) => s.doc)!
  const { ent } = useEntitlements()
  const i = doc.slides.findIndex((s) => s.id === slide.id)
  const prev = doc.slides[i - 1]
  const t = slide.transition
  const morph = t?.type === 'morph' && !!prev
  const ms = t?.duration ?? (morph ? MORPH_DEFAULTS.duration : 500)
  const stop = () => useUi.getState().stopTransitionPreview()
  useEffect(() => {
    if (morph || hold) return
    const timer = setTimeout(stop, ms + 500)
    return () => clearTimeout(timer)
  }, [morph, hold, ms])
  if (morph && prev) {
    return (
      <div data-testid="transition-preview" data-kind="morph" style={{ position: 'absolute', left: 0, top: 0, zIndex: 40, pointerEvents: 'none' }}>
        <MorphLayer from={prev} to={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} duration={ms} easing={easingCss(t?.easing ?? MORPH_DEFAULTS.easing)} blend={t?.blend ?? 'through'} by={t?.by ?? 'object'} watermark={ent?.features.watermark ?? false} handleRef={morphPreviewHandle} onDone={() => { if (!hold) setTimeout(stop, 500) }} />
      </div>
    )
  }
  return (
    <div data-testid="transition-preview" data-kind={t?.type ?? 'fade'} style={{ position: 'absolute', left: 0, top: 0, zIndex: 40, pointerEvents: 'none', background: '#000', borderRadius: 4 }}>
      <div style={{ ...transitionStyle(slide, doc.theme.motion?.transition) }}><SlideCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} width={width} play /></div>
    </div>
  )
}
