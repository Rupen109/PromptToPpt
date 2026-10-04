import type { AspectRatio, Slide } from '@prompttoppt/validation'
import type { ImageStyle } from '@prompttoppt/api-client'
import * as C from '@/editor/commands'

export const STYLES: { id: ImageStyle | 'none'; label: string }[] = [
  { id: 'none', label: 'No style' }, { id: 'photo', label: 'Photo' }, { id: 'illustration', label: 'Illustration' },
  { id: '3d', label: '3D render' }, { id: 'minimal', label: 'Minimal' }, { id: 'abstract', label: 'Abstract' }, { id: 'watercolor', label: 'Watercolour' },
]

/** Picture shape that fits where it will go (so little is cropped): background → the slide's ratio; beside → the near-square picture frame; else landscape. */
export function aspectFor(placement: C.ImagePlacement, deck: AspectRatio): '16:9' | '4:3' | '1:1' | '3:4' {
  if (placement === 'background') return deck
  if (placement === 'beside') return '1:1'
  if (placement === 'replace') return '4:3'
  return '4:3'
}

/** Puts a generated picture on a slide according to the chosen placement. Call inside `apply()` so it is one undo step. */
export function placeImage(d: C.D, slide: Slide, placement: C.ImagePlacement, img: C.PlacedImage, elementId?: string) {
  switch (placement) {
    case 'background': return C.setImageBackground(d, slide.id, img.url)
    case 'beside': return C.placeImageBeside(d, slide.id, img)
    case 'replace': return elementId ? C.setImageElementSrc(d, slide.id, elementId, img) : undefined
    case 'floating': return void C.insertImageElement(d, slide.id, img)
  }
}
