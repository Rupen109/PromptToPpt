import type { CSSProperties } from 'react'

/**
 * The loading indicator of the whole editor: a little stack of slides that deals itself, the front slide flying off to the back while the next one comes forward. `fullScreen` is for a page
 * that has nothing to show yet; `size="sm"` sits inline in a panel or dialog next to its words. The words stay on the page (screen readers, and the tests wait for them to go).
 */
export function SlideLoader({ label = 'Loading…', size = 'md', tone = 'light', fullScreen = false, className = '' }: { label?: string; size?: 'sm' | 'md' | 'lg'; tone?: 'light' | 'dark'; fullScreen?: boolean; className?: string }) {
  const w = size === 'sm' ? 40 : size === 'lg' ? 168 : 112
  const stack = (
    <span className="pt-sl" style={{ '--w': `${w}px` } as CSSProperties} aria-hidden>
      <i className="pt-sl-card" /><i className="pt-sl-card" /><i className="pt-sl-card" />
    </span>
  )
  const text = <span className={size === 'sm' ? `text-sm ${tone === 'dark' ? 'text-white/70' : 'text-slate-600'}` : tone === 'dark' ? 'font-heading font-semibold text-sm text-white/80' : 'font-heading font-semibold text-sm pt-shimmer'}>{label}</span>
  const body = size === 'sm'
    ? <span role="status" aria-live="polite" className={`inline-flex items-center gap-3 ${className}`}>{stack}{text}</span>
    : <span role="status" aria-live="polite" className={`inline-flex flex-col items-center gap-6 ${className}`}>{stack}<span className="flex items-center">{text}<span className="pt-dots ml-1.5" aria-hidden><span /><span /><span /></span></span></span>
  return fullScreen
    ? <div className={`min-h-screen grid place-items-center ${tone === 'dark' ? 'bg-[#111]' : ''}`}>{body}</div>
    : body
}
