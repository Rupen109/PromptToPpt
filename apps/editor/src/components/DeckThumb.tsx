import { FitSlide } from '@prompttoppt/ui'
import type { AspectRatio, Slide, Theme } from '@prompttoppt/validation'
import type { PresentationSummary } from '@prompttoppt/api-client'

/** The first slide of a deck, rendered for real (the library used to show an empty gradient). */
export function DeckThumb({ deck }: { deck: PresentationSummary }) {
  const slide = deck.cover as Slide | null | undefined
  const theme = deck.theme as Theme | null | undefined
  const aspect = (['16:9', '4:3', '1:1'].includes(deck.aspectRatio) ? deck.aspectRatio : '16:9') as AspectRatio
  return (
    <div className="rounded-lg overflow-hidden bg-slate-100 border border-border mb-3 pointer-events-none flex items-center justify-center" style={{ aspectRatio: '16 / 9' }}>
      {slide && theme ? <div style={{ width: aspect === '16:9' ? '100%' : aspect === '4:3' ? '75%' : '56.25%' }}><FitSlide slide={slide} theme={theme} aspect={aspect} /></div> : <span className="text-xs text-slate-500">No preview</span>}
    </div>
  )
}
