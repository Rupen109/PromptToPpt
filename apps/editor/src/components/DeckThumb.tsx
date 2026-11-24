import { FitSlide } from '@prompttoppt/ui'
import { ASPECT_RATIOS, CANVAS, type AspectRatio, type Slide, type Theme } from '@prompttoppt/validation'
import type { PresentationSummary } from '@prompttoppt/api-client'

/** The first slide of a deck, rendered for real (the library used to show an empty gradient). */
export function DeckThumb({ deck, className = 'mb-3', flush = false }: { deck: PresentationSummary; className?: string; /** edge to edge inside a card: no border or rounding of its own */ flush?: boolean }) {
  const slide = deck.cover as Slide | null | undefined
  const theme = deck.theme as Theme | null | undefined
  const aspect = (ASPECT_RATIOS as readonly string[]).includes(deck.aspectRatio) ? (deck.aspectRatio as AspectRatio) : '16:9'
  return (
    <div className={`overflow-hidden bg-slate-100 ${flush ? '' : 'rounded-lg border border-border'} ${className} pointer-events-none flex items-center justify-center`} style={{ aspectRatio: '16 / 9' }}>
      {slide && theme ? <div style={{ width: `${Math.round(Math.min(1, (CANVAS[aspect].width / CANVAS[aspect].height) / (16 / 9)) * 10000) / 100}%` }}><FitSlide slide={slide} theme={theme} aspect={aspect} /></div> : <span className="text-xs text-slate-500">No preview</span>}
    </div>
  )
}
