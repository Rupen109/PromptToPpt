import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'
import { DesktopAuth } from './AuthActions'
import { LanguageSelect } from './LanguageSelect'
import { MobileNav } from './MobileNav'
import { ResourcesMenu, TemplatesMenu } from './NavMenus'
import { LANDINGS } from '@/lib/template-landing'

/** The phone menu lists everything flat (a menu inside a menu is hard to use on a phone). */
const MOBILE_ITEMS = [
  { label: 'Interactive Studio', href: '/#studio' },
  { label: 'Templates', href: '/templates' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Tech news', href: '/news' },
  { label: 'Guides', href: '/guides' },
  { label: 'Support', href: '/support' },
  { label: 'FAQ', href: '/#faq' },
]

const LINK = 'relative inline-flex items-center rounded-lg px-3 py-2 font-heading font-bold text-sm text-[#475569] whitespace-nowrap transition-colors hover:bg-[#f1f5f9] hover:text-primary'

export function Header() {
  const collections = LANDINGS.map((l) => ({ href: `/free-templates/${l.slug}`, label: `${l.noun} templates` }))
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b-2 border-foreground">
      <div className="max-w-[1280px] mx-auto h-20 px-5 md:px-10 flex items-center justify-between gap-6">
        <Link href="/" aria-label="SlidesDone home" translate="no" className="shrink-0"><Logo size={38} /></Link>

        <nav className="hidden xl:flex items-center gap-1" aria-label="Main">
          <Link href="/#studio" className={LINK}>Interactive Studio</Link>
          <TemplatesMenu items={collections} />
          <Link href="/pricing" className={LINK}>Pricing</Link>
          <ResourcesMenu />
          <Link href="/support" className={LINK}>Support</Link>
        </nav>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden sm:block"><LanguageSelect /></div>
          <DesktopAuth />
          <MobileNav items={MOBILE_ITEMS} />
        </div>
      </div>
    </header>
  )
}
