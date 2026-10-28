import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { DesktopAuth } from './AuthActions'
import { MobileNav } from './MobileNav'

const NAV = [
  ['Ingest Modes', '/#modalities', '4'],
  ['Interactive Studio', '/#studio'],
  ['How It Works', '/#workflow'],
  ['Templates', '/templates'],
  ['Free Tools', '/free-tools'],
  ['Pricing', '/pricing'],
  ['FAQ', '/#faq'],
] as const

/** The desktop bar holds six links (the row has a fixed 1280px width at every screen size, so a seventh never fits next to the sign-in buttons — it measured ~60px too wide); FAQ stays in the mobile menu and the footer. */
const NOT_IN_BAR = new Set<string>(['FAQ'])

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-foreground">
      <div className="max-w-[1280px] mx-auto h-20 px-5 md:px-10 flex items-center justify-between gap-6">
        <Link href="/" aria-label="SlidesDone home" className="shrink-0"><Logo size={38} /></Link>

        <nav className="hidden xl:flex items-center gap-5" aria-label="Main">
          {NAV.filter(([label]) => !NOT_IN_BAR.has(label)).map(([label, href, count]) => (
            <Link key={label} href={href} className={`relative inline-flex items-center gap-2 font-heading font-bold text-sm text-[#475569] hover:text-primary transition-colors whitespace-nowrap after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:scale-x-100`}>
              {label}
              {count && <span className="bg-[#fffbe6] border border-foreground rounded px-1.5 text-[11px] leading-5 font-extrabold text-foreground">{count}</span>}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 md:gap-6">
          <DesktopAuth />
          <MobileNav items={NAV.map(([label, href]) => ({ label, href }))} />
        </div>
      </div>
    </header>
  )
}
