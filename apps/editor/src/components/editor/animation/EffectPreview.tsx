import { useMemo, useState } from 'react'
import { Play, X } from '@prompttoppt/ui/icons'
import { SlideCanvas, useSlidePlayer } from '@prompttoppt/ui'
import type { Presentation, Slide } from '@prompttoppt/validation'
import { useDialog } from '@/lib/useDialog'

/** Plays the slide's effects the way Present mode does: a click (or the button) plays the next step. */
export function EffectPreview({ doc, slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const dialog = useDialog<HTMLDivElement>(true, onClose)
  const [run, setRun] = useState(0)
  const fresh = useMemo(() => ({ ...slide }), [slide, run]) // a new object restarts the player from the beginning
  const { rootRef, playerRef } = useSlidePlayer(fresh, 'forward')
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 grid place-items-center p-4" role="presentation">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Animation preview" data-testid="effect-preview" className="bg-white rounded-2xl shadow-2xl p-4 max-w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Preview</h2>
          <button type="button" aria-label="Close preview" onClick={onClose} className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
        </div>
        <div ref={rootRef} onClick={() => playerRef.current?.advance()} className="cursor-pointer" style={{ width: 'min(840px, calc(100vw - 64px))' }}>
          <SlideCanvas slide={fresh} theme={doc.theme} aspect={doc.aspectRatio} width={Math.min(840, Math.max(280, (typeof window === 'undefined' ? 840 : window.innerWidth) - 64))} play effects />
        </div>
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-slate-500">Click the slide or press Next to play the next effect.</span>
          <span className="flex gap-2">
            <button type="button" data-testid="preview-next" onClick={() => playerRef.current?.advance()} className="h-9 px-3 rounded-lg border border-border hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5"><Play aria-hidden size={14} />Next</button>
            <button type="button" data-testid="preview-restart" onClick={() => setRun((r) => r + 1)} className="h-9 px-3 rounded-lg bg-primary text-white hover:opacity-90">Replay</button>
          </span>
        </div>
      </div>
    </div>
  )
}
