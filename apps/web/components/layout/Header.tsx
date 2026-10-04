import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { Button } from '@/components/ui/Button'
import { MobileNav } from './MobileNav'

const NAV = [
  ['Ingest Modes', '/#modalities', '4'],
  ['Interactive Studio', '/#studio'],
  ['How It Works', '/#workflow'],
  ['Templates', '/templates'],
  ['Pricing', '/pricing'],
  ['FAQ', '/#faq'],
] as const

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-foreground">
      <div className="max-w-[1280px] mx-auto h-20 px-5 md:px-10 flex items-center justify-between gap-6">
        <Link href="/" aria-label="promptToPpt home" className="shrink-0"><Logo size={38} /></Link>

        <nav className="hidden xl:flex items-center gap-8" aria-label="Main">
          {NAV.map(([label, href, count]) => (
            <Link key={label} href={href} className="relative inline-flex items-center gap-2 font-heading font-bold text-sm text-[#475569] hover:text-primary transition-colors whitespace-nowrap after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:scale-x-100">
              {label}
              {count && <span className="bg-[#fffbe6] border border-foreground rounded px-1.5 text-[11px] leading-5 font-extrabold text-foreground">{count}</span>}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 md:gap-6">
          <Button href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex !normal-case !tracking-normal !text-sm !font-bold">Log In</Button>
          <Button href="/signup" variant="accent" size="md" arrow className="hidden sm:inline-flex !normal-case !tracking-normal !text-sm">Create Free Deck</Button>
          <MobileNav items={NAV.map(([label, href]) => ({ label, href }))} />
        </div>
      </div>
    </header>
  )
}
