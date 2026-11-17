import { useEffect, useMemo, useRef, useState } from 'react'
import { SlideCanvas, compileTimeline, useSlidePlayer } from '@prompttoppt/ui'
import type { Presentation, Slide } from '@prompttoppt/validation'
import { useUi } from '@/editor/ui'

/**
 * The animation preview, in place on the canvas: the slide is drawn again over the editing surface with its effects switched on and played through by itself (every On Click
 * step follows the one before it, like a run through Present mode). It never touches the document. `only` limits it to some objects' effects; `fromEffectId` starts at that
 * effect's click. Stop (or the end of the run) removes it. The parent gives it `key={run}`, so every Preview starts a fresh one. `width` is the stage width the canvas is drawn at.
 */
export function CanvasPreview({ doc, slide, width, only, fromEffectId, run }: { doc: Presentation; slide: Slide; width: number; only: string[] | null; fromEffectId: string | null; run: number }) {
  const played = useMemo<Slide>(() => {
    const effects = (slide.effects ?? []).filter((e) => !only || only.includes(e.elementId))
    return { ...slide, effects }
  }, [slide, only, run]) // eslint-disable-line react-hooks/exhaustive-deps
  const { rootRef, playerRef, version } = useSlidePlayer(played, 'forward')
  const [done, setDone] = useState(false)
  const started = useRef(false)

  useEffect(() => { if (!played.effects?.length) useUi.getState().stopPreview() }, [played])
  // jump to the step of the chosen effect (those before it are shown finished), then run every click step in turn
  useEffect(() => {
    const p = playerRef.current
    if (!p || started.current) return
    started.current = true
    if (fromEffectId) {
      const ids = new Set(played.elements.map((e) => e.id))
      const steps = compileTimeline(played.effects ?? [], ids)
      const at = steps.findIndex((s) => s.effects.some((x) => x.effect.id === fromEffectId))
      if (at > 0) p.skipTo(at)
    }
  })
  useEffect(() => {
    const p = playerRef.current
    if (!p || !started.current) return
    if (!p.running) {
      if (p.remaining > 0) { const t = setTimeout(() => { p.advance() }, 250); return () => clearTimeout(t) }
      const t = setTimeout(() => { setDone(true); useUi.getState().stopPreview() }, 500)
      return () => clearTimeout(t)
    }
    return undefined
  }, [version, playerRef])

  return (
    <div ref={rootRef} data-testid="canvas-preview" data-done={done ? '1' : '0'} style={{ position: 'absolute', left: 0, top: 0, zIndex: 40, pointerEvents: 'none' }} aria-hidden>
      <SlideCanvas slide={played} theme={doc.theme} aspect={doc.aspectRatio} width={width} play effects />
    </div>
  )
}
