import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

/**
 * THE call-to-action. Every button on the landing page is this component, so the motion is written once:
 * hard ink shadow that grows as the button lifts on hover, presses flat on click, a light sweep across filled buttons, and an
 * arrow that glides forward. Motion is skipped for reduced-motion users. Pass `href` for a link, otherwise it is a <button>.
 */
const VARIANT = {
  accent: 'bg-accent text-white',
  primary: 'bg-primary text-white',
  ink: 'bg-foreground text-white',
  dark: 'bg-foreground text-highlight',
  white: 'bg-white text-foreground',
  yellow: 'bg-secondary text-foreground',
  lime: 'bg-highlight text-foreground',
  ghost: 'bg-transparent text-foreground hover:text-primary',
  soft: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  softActive: 'bg-primary text-white',
} as const

const SIZE = {
  xs: 'h-8 max-sm:h-9 px-3 text-[11px] rounded-lg',
  sm: 'h-9 max-sm:h-10 px-3.5 text-xs rounded-xl',
  md: 'h-11 px-5 text-xs rounded-xl',
  lg: 'h-14 max-sm:h-12 px-8 max-sm:px-6 text-sm rounded-2xl',
} as const

/** rest → hover (lifts, shadow grows) → active (presses flat). Offsets follow the Figma hard-shadow scale. */
const DEPTH = {
  none: '',
  sm: 'shadow-[2px_3px_0_0_#181b25] hover:shadow-[4px_5px_0_0_#181b25] motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5 active:shadow-none motion-safe:active:translate-x-0.5 motion-safe:active:translate-y-[3px]',
  md: 'shadow-[3px_4px_0_0_#181b25] hover:shadow-[6px_8px_0_0_#181b25] motion-safe:hover:-translate-x-[3px] motion-safe:hover:-translate-y-1 active:shadow-none motion-safe:active:translate-x-[3px] motion-safe:active:translate-y-1',
  lg: 'shadow-[4px_5px_0_0_#181b25] hover:shadow-[8px_10px_0_0_#181b25] motion-safe:hover:-translate-x-1 motion-safe:hover:-translate-y-[5px] active:shadow-none motion-safe:active:translate-x-1 motion-safe:active:translate-y-[5px]',
} as const
const DEFAULT_DEPTH = { xs: 'sm', sm: 'sm', md: 'sm', lg: 'md' } as const

export type ButtonVariant = keyof typeof VARIANT
export type ButtonSize = keyof typeof SIZE

interface Common {
  variant?: ButtonVariant
  size?: ButtonSize
  /** hard-shadow scale; defaults from size. `none` for flat buttons. */
  depth?: keyof typeof DEPTH
  /** trailing arrow that glides forward on hover */
  arrow?: boolean
  loading?: boolean
  block?: boolean
  /** pill shape (chips / tabs): no ink border, no shadow */
  pill?: boolean
  className?: string
  children?: ReactNode
}
type AsLink = Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common | 'href'>
type AsButton = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common>

export function Button(props: AsLink | AsButton) {
  const { variant = 'primary', size = 'md', depth, arrow, loading, block, pill, className, children, ...rest } = props
  const flat = variant === 'ghost' || pill
  const classes = cn(
    'group relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap select-none font-heading font-extrabold uppercase tracking-[0.6px]',
    'transition-[transform,box-shadow,background-color,color] duration-200 ease-[cubic-bezier(.2,.7,.2,1)]',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    SIZE[size],
    pill && '!rounded-full',
    flat ? 'border-2 border-transparent' : 'border-2 border-foreground',
    VARIANT[variant],
    !flat && DEPTH[depth ?? DEFAULT_DEPTH[size]],
    block && 'w-full',
    className,
  )
  const inner = (
    <>
      {!flat && <span aria-hidden className={cn('pointer-events-none absolute inset-y-0 -left-[60%] w-1/2 -skew-x-[20deg] opacity-0 transition-[left,opacity] duration-700 ease-out motion-safe:group-hover:left-[130%] motion-safe:group-hover:opacity-100', variant === 'white' ? 'bg-foreground/5' : 'bg-white/30')} />}
      {loading && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      <span className="relative inline-flex items-center gap-2">{children}</span>
      {arrow && <span aria-hidden className="relative inline-block transition-transform duration-200 motion-safe:group-hover:translate-x-1">→</span>}
    </>
  )
  if ('href' in props && props.href !== undefined) {
    const { href, ...a } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
    return /^(https?:)?\/\//.test(href) ? <a href={href} className={classes} {...a}>{inner}</a> : <Link href={href} className={classes} {...a}>{inner}</Link>
  }
  const { type = 'button', ...b } = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return <button type={type} className={classes} aria-busy={loading || undefined} {...b} disabled={b.disabled || loading}>{inner}</button>
}
