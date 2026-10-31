import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@prompttoppt/ui/logo'
import { AuthShowcase } from './AuthShowcase'

/** form on the left, what SlidesDone does on the right (the right side only from large screens up) */
export function AuthShell({ mode, children }: { mode: 'login' | 'signup'; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] px-6 py-12">
        <Link href="/" aria-label="SlidesDone home"><Logo size={44} /></Link>
        {children}
      </section>
      <AuthShowcase mode={mode} />
    </main>
  )
}
