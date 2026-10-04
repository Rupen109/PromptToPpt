import type { ReactNode } from 'react'
import { cn } from './cn'
import { Reveal } from './Reveal'

/**
 * THE card. Every card on the landing page is this component: pastel tone, hard ink shadow, scroll-reveal with stagger
 * (`index`), and a lift on hover that grows the shadow. Layout classes go in `className` (applied to the card itself);
 * `wrapperClassName` styles the reveal wrapper (e.g. `self-start`, or `md:-mt-4` for a raised card).
 */
const TONE = {
  white: 'bg-white',
  cream: 'bg-[#fffbe6]',
  peach: 'bg-[#fff2ee]',
  lavender: 'bg-[#f5f3ff]',
  mist: 'bg-[#f3f4f9]',
  yellow: 'bg-secondary',
  ink: 'bg-foreground text-white',
} as const
const SHADOW = {
  none: { rest: '', hover: '' },
  sm: { rest: 'shadow-[2px_3px_0_0_#181b25]', hover: 'hover:shadow-[4px_5px_0_0_#181b25]' },
  md: { rest: 'shadow-[4px_5px_0_0_#181b25]', hover: 'hover:shadow-[7px_9px_0_0_#181b25]' },
  lg: { rest: 'shadow-[7px_9px_0_0_#181b25]', hover: 'hover:shadow-[10px_13px_0_0_#181b25]' },
} as const
const RADIUS = { xl: 'rounded-xl', '2xl': 'rounded-2xl', '3xl': 'rounded-3xl' } as const

export type CardTone = keyof typeof TONE

export function Card({
  as = 'div', tone = 'white', shadow = 'md', radius = '3xl', border = false, hover = true, reveal = true, index = 0, className, wrapperClassName, children,
}: {
  as?: 'div' | 'article' | 'li' | 'section'
  tone?: CardTone
  shadow?: keyof typeof SHADOW
  radius?: keyof typeof RADIUS
  /** 2px ink outline (the FAQ / prompt-card look) */
  border?: boolean
  /** lift + bigger shadow on hover */
  hover?: boolean
  /** fade-up when scrolled into view */
  reveal?: boolean
  /** position in a grid, for the stagger */
  index?: number
  className?: string
  wrapperClassName?: string
  children: ReactNode
}) {
  const Tag = as
  const body = (
    <Tag className={cn(
      'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)]',
      TONE[tone], RADIUS[radius], SHADOW[shadow].rest, border && 'border-2 border-foreground',
      hover && [SHADOW[shadow].hover, 'motion-safe:hover:-translate-y-1.5'].join(' '),
      className,
    )}>{children}</Tag>
  )
  return reveal ? <Reveal index={index} className={wrapperClassName ?? 'h-full'}>{body}</Reveal> : wrapperClassName ? <div className={wrapperClassName}>{body}</div> : body
}
