import type { SlideElement } from '@prompttoppt/validation'
import { othersOf, useLive } from '@/editor/live'

/**
 * Other people on this slide, drawn in slide coordinates inside the canvas's scaled layer: what each has selected (coloured outline + name),
 * the text box someone is typing in ("Maya is typing…") and their pointer. Sizes are divided by `scale` so labels stay readable at any zoom.
 */
export function PeerLayer({ slideId, elements, scale }: { slideId: string; elements: SlideElement[]; scale: number }) {
  const peers = useLive((s) => s.peers)
  const me = useLive((s) => s.you?.userId)
  const here = othersOf(peers, me).filter((p) => p.slideId === slideId)
  if (here.length === 0) return null
  const px = (n: number) => n / scale
  return (
    <>
      {here.flatMap((p) =>
        p.selection.map((id, i) => {
          const el = elements.find((e) => e.id === id)
          if (!el) return null
          const typing = p.editing === id
          return (
            <div key={`${p.userId}:${p.clientId}:${id}`} aria-hidden data-peer-selection={p.name} style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 9400, pointerEvents: 'none', outline: `${px(2)}px ${typing ? 'dashed' : 'solid'} ${p.color}`, outlineOffset: px(1) }}>
              {i === 0 && (
                <span style={{ position: 'absolute', left: 0, top: -px(20), background: p.color, color: '#fff', fontSize: px(11), lineHeight: `${px(18)}px`, padding: `0 ${px(6)}px`, borderRadius: px(4), whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600 }}>
                  {typing ? `${p.name} is typing…` : p.name}
                </span>
              )}
            </div>
          )
        }),
      )}
      {here.map((p) => p.cursor && (
        <div key={`c-${p.userId}:${p.clientId}`} aria-hidden data-peer-cursor={p.name} style={{ position: 'absolute', left: p.cursor.x, top: p.cursor.y, zIndex: 9700, pointerEvents: 'none', transition: 'left 90ms linear, top 90ms linear' }}>
          <svg width={px(16)} height={px(20)} viewBox="0 0 16 20" style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))' }}><path d="M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.6 11.6 L13 11.6 Z" fill={p.color} stroke="#fff" strokeWidth="1.2" /></svg>
          <span style={{ position: 'absolute', left: px(14), top: px(14), background: p.color, color: '#fff', fontSize: px(11), lineHeight: `${px(16)}px`, padding: `0 ${px(6)}px`, borderRadius: px(4), whiteSpace: 'nowrap', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600 }}>{p.name}</span>
        </div>
      ))}
    </>
  )
}
