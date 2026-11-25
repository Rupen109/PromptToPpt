'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

/**
 * A link that loads its page AHEAD only when the person shows they may open it (pointer over it, keyboard focus, a touch), never just because it is on screen.
 * Next.js otherwise prefetches the whole page of every visible link (docs: Link `prefetch`): a gallery of dozens of templates started dozens of page downloads,
 * and far from the server the page that was actually clicked waited behind them. Use it for grids and lists of many links.
 */
export function HoverLink({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const router = useRouter()
  const ahead = () => { if (typeof props.href === 'string') router.prefetch(props.href) }
  return (
    <Link
      {...props}
      prefetch={false}
      onMouseEnter={(e) => { ahead(); onMouseEnter?.(e) }}
      onFocus={(e) => { ahead(); onFocus?.(e) }}
      onTouchStart={(e) => { ahead(); onTouchStart?.(e) }}
    />
  )
}
