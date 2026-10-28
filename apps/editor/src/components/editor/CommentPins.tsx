import { useComments } from '@/editor/comments'
import { useUi } from '@/editor/ui'

/**
 * Pins of the open comment threads on this slide, drawn in slide coordinates inside the canvas's scaled layer (sizes divided by `scale`, like the
 * other people's cursors). Only shown while the Comments panel is open, so they never get in the way of editing. They are not part of the slide.
 */
export function CommentPins({ slideId, W, H, scale }: { slideId: string; W: number; H: number; scale: number }) {
  const open = useUi((s) => s.drawer === 'comments')
  const threads = useComments((s) => s.threads)
  const pending = useComments((s) => s.pending)
  const focus = useComments((s) => s.focus)
  if (!open) return null
  const px = (n: number) => n / scale
  const pins = threads.filter((t) => t.slideId === slideId && t.x !== null && t.y !== null && t.status === 'open')
  return (
    <>
      {pins.map((t, i) => (
        <button
          key={t.id} type="button" aria-label={`Comment ${i + 1}: ${t.comments[0]?.body.slice(0, 60) ?? ''}`} data-comment-pin={t.id}
          onClick={(e) => { e.stopPropagation(); useComments.getState().setFocus(t.id) }}
          style={{ position: 'absolute', left: t.x! * W - px(14), top: t.y! * H - px(28), width: px(28), height: px(28), zIndex: 9800, pointerEvents: 'auto', borderRadius: `${px(14)}px ${px(14)}px ${px(14)}px 0`, background: focus === t.id ? '#1d4ed8' : '#2563eb', color: '#fff', fontSize: px(13), fontWeight: 700, border: `${px(2)}px solid #fff`, boxShadow: '0 1px 4px rgba(0,0,0,.4)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >{i + 1}</button>
      ))}
      {pending && pending.slideId === slideId && <div aria-hidden data-comment-pin-draft style={{ position: 'absolute', left: pending.x * W - px(14), top: pending.y * H - px(28), width: px(28), height: px(28), zIndex: 9800, borderRadius: `${px(14)}px ${px(14)}px ${px(14)}px 0`, border: `${px(2)}px dashed #2563eb`, background: 'rgba(37,99,235,.18)', pointerEvents: 'none' }} />}
    </>
  )
}
