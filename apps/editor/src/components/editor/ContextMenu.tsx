import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem =
  | { type?: 'item'; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; hint?: string }
  | { type: 'divider' }
  | { type: 'swatches'; label: string; options: { value: string; css: string; title: string }[]; onPick: (v: string) => void }
  | { type: 'emoji'; label: string; options: string[]; onPick: (v: string) => void }

/** Right-click / "⋯" menu (reference screenshot 1). Closes on outside click, Escape, scroll or resize. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const close = () => onClose()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const all = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
        const i = all.indexOf(document.activeElement as HTMLElement)
        all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
      }
    }
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    document.addEventListener('keydown', key)
    document.addEventListener('mousedown', down)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('mousedown', down)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose])
  // measure the REAL menu and keep all of it inside the viewport (a fixed guess pushed the lower items of tall menus off-screen, unreachable)
  const [pos, setPos] = useState({ left: Math.max(8, Math.min(x, window.innerWidth - 240)), top: Math.max(8, y) })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const h = Math.min(el.offsetHeight, window.innerHeight - 16)
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8)), top: Math.max(8, Math.min(y, window.innerHeight - h - 8)) })
  }, [x, y, items.length])
  const { left, top } = pos
  return (
    <div ref={ref} role="menu" style={{ position: 'fixed', left, top, zIndex: 60, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }} className="w-56 bg-white border border-border rounded-xl shadow-xl p-1.5 text-sm">
      {items.map((it, i) => {
        if (it.type === 'divider') return <div key={i} role="separator" className="h-px bg-border my-1" />
        if (it.type === 'swatches')
          return (
            <div key={i} className="px-2.5 py-2"><div className="text-xs text-slate-500 mb-1.5">{it.label}</div>
              <div className="flex flex-wrap gap-1.5">{it.options.map((o) => <button key={o.value} role="menuitem" title={o.title} aria-label={o.title} onClick={() => { it.onPick(o.value); onClose() }} className="w-6 h-6 rounded-full border border-slate-300" style={{ background: o.css }} />)}</div></div>
          )
        if (it.type === 'emoji')
          return (
            <div key={i} className="px-2.5 py-2"><div className="text-xs text-slate-500 mb-1.5">{it.label}</div>
              <div className="flex flex-wrap gap-1">{it.options.map((o) => <button key={o} role="menuitem" aria-label={`Sticker ${o}`} onClick={() => { it.onPick(o); onClose() }} className="w-8 h-8 rounded-md hover:bg-slate-100 text-lg">{o}</button>)}</div></div>
          )
        return (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { it.onClick(); onClose() }} className={`w-full text-left px-2.5 py-2 rounded-lg flex justify-between disabled:opacity-40 ${it.danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-slate-100'}`}>
            <span>{it.label}</span>{it.hint && <span className="text-xs text-slate-500">{it.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
