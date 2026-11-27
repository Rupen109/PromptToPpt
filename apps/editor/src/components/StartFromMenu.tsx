import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, FileUp, LayoutTemplate, Lock, Sparkles, type LucideIcon } from '@prompttoppt/ui/icons'

/** what the new deck is started from; Remix is not a state of this box (it opens its own dialog) */
export type StartFrom = 'prompt' | 'design' | 'morph'

interface Props {
  value: StartFrom
  /** the chosen file design's name, or the Morph template's name, shown on the button */
  name?: string | undefined
  /** the plan does not include it: the item shows a Pro lock (choosing it still opens the upgrade message) */
  designLocked: boolean
  remixLocked: boolean
  /** why "a file's design" cannot be chosen right now (a Morph template is set), or null */
  designUnavailable: string | null
  onPrompt: () => void
  onDesign: () => void
  onRemix: () => void
}

interface Item { id: 'prompt' | 'design' | 'remix'; icon: LucideIcon; title: string; hint: string; testId: string; locked?: boolean; disabled?: string | null; run: () => void }

/**
 * "Start from": one box in the prompt bar for HOW the new deck starts, so the options sit in one clear place instead of a strip of buttons and a
 * paragraph. Each choice says what it does in one line. The two paid ones show the Pro lock (choosing one on a plan without it shows the upgrade message).
 */
export function StartFromMenu({ value, name, designLocked, remixLocked, designUnavailable, onPrompt, onDesign, onRemix }: Props) {
  const [open, setOpen] = useState(false)
  /** on a narrow screen the menu spans the screen under the button (anchored to the button it would run off the edge) */
  const [narrow, setNarrow] = useState<{ top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const items: Item[] = [
    { id: 'prompt', icon: Sparkles, title: 'Your prompt', hint: 'AI writes the slides and picks a design for your topic.', testId: 'start-prompt', run: onPrompt },
    { id: 'design', icon: LayoutTemplate, title: "A file's design", hint: 'Upload a PowerPoint or PDF. The new deck keeps its colours, fonts and layouts.', testId: 'file-tpl-open', locked: designLocked, disabled: designUnavailable, run: onDesign },
    { id: 'remix', icon: FileUp, title: 'Remix a PowerPoint', hint: 'Upload a deck and get a new version: a new length, format or audience.', testId: 'remix-pptx-open', locked: remixLocked, run: onRemix },
  ]
  const label = value === 'design' ? `Design: ${name ?? 'your file'}` : value === 'morph' ? `Morph: ${name ?? 'template'}` : 'Your prompt'
  const Icon = value === 'design' ? LayoutTemplate : Sparkles

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', away)
    // the menu opens with the chosen item focused, as a native select would
    const at = items.findIndex((i) => i.id === value)
    box.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]')[Math.max(0, at)]?.focus()
    return () => window.removeEventListener('pointerdown', away)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: Item) => { if (i.disabled) return; setOpen(false); button.current?.focus(); i.run() }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); button.current?.focus(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]') ?? [])]
    const now = all.indexOf(document.activeElement as HTMLButtonElement)
    all[(now + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
  }

  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button ref={button} type="button" data-testid="start-from" aria-haspopup="menu" aria-expanded={open}
        onClick={() => { const r = button.current!.getBoundingClientRect(); setNarrow(r.left + 340 > window.innerWidth - 16 ? { top: r.bottom + 8 } : null); setOpen((o) => !o) }}
        title="How the new presentation starts"
        className={`inline-flex h-10 max-w-[260px] items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${value === 'prompt' ? 'border-border bg-white text-slate-700 hover:border-slate-400' : 'border-primary/40 bg-primary/5 text-primary'}`}>
        <Icon aria-hidden size={16} className="shrink-0" />
        <span className="hidden sm:inline text-slate-500 font-normal">Start from:</span>
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden size={15} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Start from" style={narrow ? { position: 'fixed', left: 16, right: 16, top: narrow.top } : undefined}
          className={`z-30 rounded-2xl border border-border bg-white p-1.5 shadow-xl ${narrow ? '' : 'absolute left-0 top-full mt-2 w-[340px]'}`}>
          {items.map((i) => {
            const chosen = i.id === value
            return (
              <button key={i.id} type="button" role={i.id === 'remix' ? 'menuitem' : 'menuitemradio'} {...(i.id === 'remix' ? {} : { 'aria-checked': chosen })}
                data-testid={i.testId} aria-disabled={!!i.disabled} title={i.disabled ?? undefined} onClick={() => choose(i)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition focus:outline-none focus-visible:bg-slate-100 ${i.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50'} ${chosen ? 'bg-primary/5' : ''}`}>
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${chosen ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}><i.icon aria-hidden size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {i.title}
                    {i.locked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"><Lock aria-hidden size={11} />Pro</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{i.disabled ?? i.hint}</span>
                </span>
                {chosen && <Check aria-hidden size={16} className="mt-1 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
