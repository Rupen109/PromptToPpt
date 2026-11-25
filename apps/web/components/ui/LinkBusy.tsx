'use client'

import { ArrowRight } from '@prompttoppt/ui/icons'
import { useLinkStatus } from 'next/link'

const SPIN = 'h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent'

/**
 * Inside a link Button: the moment it is clicked and its page is still on the way, the arrow turns into a spinner (Next.js useLinkStatus), so a click far
 * from the server never looks like nothing happened. A button without an arrow shows the spinner only while loading.
 */
export function LinkBusy({ arrow }: { arrow: boolean }) {
  const { pending } = useLinkStatus()
  if (pending) return <span aria-hidden data-testid="link-busy" className={SPIN} />
  return arrow ? <span aria-hidden className="relative inline-block transition-transform duration-200 motion-safe:group-hover:translate-x-1"><ArrowRight size={16} strokeWidth={2.5} /></span> : null
}
