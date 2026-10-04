import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { Reveal } from '@/components/ui/Reveal'

/**
 * Section-level building blocks from the Figma landing design (buttons and cards live in components/ui). Sections are 112px
 * tall-padded (py-28) inside a 1200px container with an ink 2px bottom rule; headings are Plus Jakarta Sans 800.
 */
export const HARD = { sm: 'shadow-[2px_3px_0_0_#181b25]', md: 'shadow-[4px_5px_0_0_#181b25]', lg: 'shadow-[7px_9px_0_0_#181b25]' } as const

export function Section({ id, bg = 'bg-white', children, className = '' }: { id?: string; bg?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`${bg} border-b-2 border-foreground py-16 md:py-28 px-5 md:px-10 scroll-mt-20 ${className}`}>
      <div className="max-w-[1200px] mx-auto">{children}</div>
    </section>
  )
}

/** Pill with a hard shadow — the label above every section heading. */
export function Badge({ children, bg = 'bg-secondary', dot, className = '' }: { children: ReactNode; bg?: string; dot?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${bg} text-foreground border border-foreground rounded-full px-3 py-[5px] font-heading font-extrabold text-xs uppercase leading-4 ${HARD.sm} ${className}`}>
      {dot && <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

/** Small flat white pill ("MODALITY 01", "INPUT STAGE"). `className` can colour the text. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center bg-white border border-foreground rounded-full px-[11px] py-[3px] font-heading font-extrabold text-xs uppercase leading-4 text-foreground', className)}>{children}</span>
}

const TILE = { yellow: 'bg-secondary text-foreground', accent: 'bg-accent text-white', primary: 'bg-primary text-white', lime: 'bg-highlight text-foreground' } as const
/** Square icon/number tile with a hard shadow (workflow numbers, modality icons). */
export function Tile({ tone = 'yellow', size = 48, children, className }: { tone?: keyof typeof TILE; size?: 48 | 56; children: ReactNode; className?: string }) {
  return <div className={cn('grid place-items-center rounded-2xl border-2 border-foreground shrink-0 transition-transform duration-300 motion-safe:group-hover/card:-rotate-6 motion-safe:group-hover/card:scale-105', HARD.sm, TILE[tone], size === 56 ? 'w-14 h-14' : 'w-12 h-12', className)}>{children}</div>
}

export function SectionHeader({ badge, title, subtitle, size = 36, align = 'center', max = 'max-w-[768px]', aside, as: Tag2 = 'h2' }: { as?: 'h1' | 'h2'; badge: ReactNode; title: ReactNode; subtitle?: ReactNode; size?: 36 | 48; align?: 'center' | 'left'; max?: string; aside?: ReactNode }) {
  const head = (
    <Reveal className={`flex flex-col gap-3 ${align === 'center' ? `items-center text-center mx-auto ${max}` : `items-start text-left ${max}`}`}>
      {badge}
      <Tag2 className={`font-heading font-extrabold text-foreground ${size === 48 ? 'text-4xl md:text-5xl leading-[1.05]' : 'text-3xl md:text-4xl leading-[1.1]'}`}>{title}</Tag2>
      {subtitle && <p className="font-sans text-lg leading-7 text-[#475569]">{subtitle}</p>}
    </Reveal>
  )
  return aside ? <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">{head}{aside}</div> : head
}
