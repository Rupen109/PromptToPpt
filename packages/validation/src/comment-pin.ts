import { CANVAS, type AspectRatio, type SlideElement } from './presentation'

/**
 * Where a comment on an OBJECT shows its pin: at the object's top-right corner, as a fraction of the slide (kept inside it). ONE rule for the editor (the pin follows
 * the object as it moves) and the assistant (a comment it adds on an object); the same point is stored with the thread for when the object is removed.
 */
export function commentPinOf(el: Pick<SlideElement, 'x' | 'y' | 'width' | 'height'>, aspect: AspectRatio): { x: number; y: number } {
  const { width: W, height: H } = CANVAS[aspect]
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100000) / 100000))
  return { x: clamp((el.x + el.width) / W), y: clamp(el.y / H) }
}
