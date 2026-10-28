import Link from 'next/link'
import { Logo } from '@prompttoppt/ui/logo'

const COLS = [
  { title: 'Product', links: [['Ingestion Modes', '/#modalities'], ['Interactive Studio', '/#studio'], ['Curated Templates', '/templates'], ['SaaS Pricing', '/pricing']] },
  { title: 'Formats & Sources', links: [['PDF & PowerPoint input', '/#modalities'], ['Website link sources', '/#modalities'], ['122 animated templates', '/templates'], ['Export on Pro & Gold', '/pricing']] },
] as const

export function Footer() {
  return (
    <footer className="bg-white border-t-2 border-foreground px-5 md:px-10 pt-14">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 sm:gap-10 pb-12 border-b-2 border-[#f1f5f9]">
          <div className="flex flex-col gap-4 items-start col-span-2 lg:col-span-1">
            <Link href="/" aria-label="SlidesDone home"><Logo size={32} /></Link>
            <p className="text-xs leading-5 text-[#475569] max-w-[270px]">Vibrant AI presentation maker for venture decks, executive board reviews and fast product storytelling.</p>
            <span className="inline-flex items-center gap-2 bg-highlight border border-foreground rounded-full px-3 py-[3px] font-heading font-bold text-[11px] leading-4 text-foreground"><i className="w-2 h-2 rounded-full bg-foreground" />Early access</span>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h5 className="font-heading font-extrabold text-xs uppercase tracking-[0.6px] text-foreground mb-3">{c.title}</h5>
              <ul className="flex flex-col gap-2">
                {c.links.map(([label, href]) => <li key={label}><Link href={href} className="font-heading font-bold text-xs leading-4 text-[#475569] hover:text-primary transition-colors">{label}</Link></li>)}
              </ul>
            </nav>
          ))}
          <div>
            <h5 className="font-heading font-extrabold text-xs uppercase tracking-[0.6px] text-foreground mb-3">Trust & Privacy</h5>
            <p className="text-xs leading-4 text-[#475569] max-w-[270px]">Your decks and sources are private to your account, and never go into analytics tools.</p>
            <p className="mt-3 flex items-center gap-1.5 font-heading font-extrabold text-xs text-foreground"><span className="text-[#059669]" aria-hidden>🔒</span>Private by default</p>
          </div>
        </div>
        <div className="py-8 flex flex-col sm:flex-row items-center justify-between gap-3 font-heading font-bold text-xs text-[#475569]">
          <span>© {new Date().getFullYear()} SlidesDone. All rights reserved.</span>
          <span className="flex gap-6"><Link href="/pricing" className="text-[#475569] hover:text-primary">Pricing</Link><Link href="/templates" className="text-[#475569] hover:text-primary">Templates</Link><Link href="/login" className="text-[#475569] hover:text-primary">Log in</Link></span>
        </div>
      </div>
    </footer>
  )
}
