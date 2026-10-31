import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Clock, ExternalLink, Flame } from '@prompttoppt/ui/icons'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Card as UiCard } from '@/components/ui/Card'
import { type Card, BASE_PATH, dateLabel, hrefOf, imageSrc, type Kind } from '@/lib/content'

/** Header + hero + footer around every blog / news / guides page */
export function ContentPage({ eyebrow, title, intro, children, wide = false }: { eyebrow: string; title: string; intro?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main>
        <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] border-b-2 border-foreground px-5 md:px-10 py-12 md:py-16">
          <div className="max-w-[880px] mx-auto text-center">
            <p className="font-heading font-extrabold text-xs uppercase tracking-wide text-primary">{eyebrow}</p>
            <h1 className="mt-3 font-heading font-extrabold text-4xl md:text-5xl leading-[1.05] text-foreground">{title}</h1>
            {intro && <p className="mt-4 text-lg leading-7 font-medium text-[#475569] max-w-[680px] mx-auto">{intro}</p>}
          </div>
        </section>
        <section className={`px-5 md:px-10 py-12 md:py-16 ${wide ? '' : ''}`}><div className="max-w-[1100px] mx-auto">{children}</div></section>
      </main>
      <Footer />
    </div>
  )
}

/** pictures come from our own API (already sized by the author), so the plain tag is right here */
function Pic({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />
}

export function Unavailable({ what }: { what: string }) {
  return <p role="status" className="py-16 text-center font-medium text-[#475569]">The {what} could not be loaded just now. Please try again in a minute.</p>
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-16 text-center font-medium text-[#475569]">{children}</p>
}

export function TagBar({ kind, tags, active }: { kind: Kind; tags: { tag: string; count: number }[]; active?: string }) {
  if (tags.length === 0) return null
  const chip = (on: boolean) => `inline-flex items-center rounded-full border-2 border-foreground px-3.5 py-1.5 font-heading font-bold text-xs ${on ? 'bg-foreground text-white' : 'bg-white text-foreground hover:bg-[#f8f9fc]'}`
  return (
    <nav aria-label="Topics" className="mb-8 flex flex-wrap gap-2">
      <Link href={BASE_PATH[kind]} className={chip(!active)}>All</Link>
      {tags.map((t) => <Link key={t.tag} href={`${BASE_PATH[kind]}?tag=${encodeURIComponent(t.tag)}`} className={chip(active === t.tag)}>{t.tag}</Link>)}
    </nav>
  )
}

export function Pager({ kind, page, pages, tag }: { kind: Kind; page: number; pages: number; tag?: string }) {
  if (pages <= 1) return null
  const href = (p: number) => `${BASE_PATH[kind]}?${tag ? `tag=${encodeURIComponent(tag)}&` : ''}page=${p}`
  const btn = 'inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-white px-4 py-2 font-heading font-bold text-sm text-foreground hover:bg-[#f8f9fc]'
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={btn}><ArrowLeft aria-hidden size={16} />Newer</Link> : <span />}
      <span className="font-heading font-bold text-sm text-[#475569]">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className={btn}>Older<ArrowRight aria-hidden size={16} /></Link> : <span />}
    </nav>
  )
}

const TagRow = ({ tags }: { tags: string[] }) => (tags.length ? <ul className="flex flex-wrap gap-1.5">{tags.slice(0, 3).map((t) => <li key={t} className="list-none rounded-full bg-[#f1f5f9] px-2.5 py-0.5 font-heading font-bold text-[11px] text-[#475569]">{t}</li>)}</ul> : null)

/** a blog card (picture, title, excerpt) */
export function PostCard({ p, big = false }: { p: Card; big?: boolean }) {
  const img = imageSrc(p.coverUrl)
  return (
    <Link href={hrefOf(p)} aria-label={p.title} className="block h-full rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <UiCard as="article" tone="white" radius="3xl" shadow="md" border reveal={false} className={`h-full overflow-hidden flex ${big ? 'md:flex-row flex-col' : 'flex-col'}`} wrapperClassName="h-full">
        {img && <Pic src={img} alt={p.coverAlt ?? ''} className={`object-cover bg-[#f1f5f9] ${big ? 'md:w-1/2 w-full aspect-[16/9] md:aspect-auto' : 'w-full aspect-[16/9]'} border-b-2 md:border-b-0 border-foreground ${big ? 'md:border-r-2' : ''}`} />}
        <div className="p-6 flex flex-col gap-3 flex-1">
          <TagRow tags={p.tags} />
          <h2 className={`font-heading font-extrabold text-foreground leading-tight ${big ? 'text-2xl md:text-3xl' : 'text-xl'}`}>{p.title}</h2>
          <p className="text-sm leading-6 font-medium text-[#475569] line-clamp-3">{p.summary}</p>
          <p className="mt-auto pt-2 flex items-center gap-3 font-heading font-bold text-xs text-[#64748b]"><span>{dateLabel(p.publishedAt)}</span><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock aria-hidden size={12} />{p.readingMinutes} min read</span></p>
        </div>
      </UiCard>
    </Link>
  )
}

/** a short news item: the story itself, where it came from, and a link to the original */
export function NewsItem({ p }: { p: Card }) {
  const img = imageSrc(p.coverUrl)
  return (
    <UiCard as="article" tone="white" radius="2xl" shadow="sm" border reveal={false} hover={false} className="p-5 flex gap-4" wrapperClassName="h-full">
      {img && <Pic src={img} alt={p.coverAlt ?? ''} className="hidden sm:block w-32 h-24 rounded-xl border-2 border-foreground object-cover shrink-0 bg-[#f1f5f9]" />}
      <div className="flex flex-col gap-2 min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-heading font-bold text-xs text-[#64748b]">
          {p.trending && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2ee] border border-foreground px-2 py-0.5 text-foreground"><Flame aria-hidden size={12} />Trending</span>}
          <span>{dateLabel(p.publishedAt)}</span>{p.sourceName && <><span aria-hidden>·</span><span>{p.sourceName}</span></>}
        </p>
        <h2 className="font-heading font-extrabold text-lg leading-snug text-foreground"><Link href={hrefOf(p)} className="hover:text-primary">{p.title}</Link></h2>
        <p className="text-sm leading-6 font-medium text-[#475569]">{p.summary}</p>
        <p className="flex flex-wrap items-center gap-4 pt-1 font-heading font-bold text-xs">
          {p.hasBody && <Link href={hrefOf(p)} className="inline-flex items-center gap-1 text-primary hover:underline">Read more<ArrowRight aria-hidden size={12} /></Link>}
          {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[#475569] hover:text-primary">Source<ExternalLink aria-hidden size={12} /></a>}
        </p>
      </div>
    </UiCard>
  )
}

export function Related({ items, title = 'Keep reading' }: { items: Card[]; title?: string }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="related" className="mt-16">
      <h2 id="related" className="font-heading font-extrabold text-2xl text-foreground">{title}</h2>
      <ul className="mt-6 grid gap-6 md:grid-cols-3">{items.map((p) => <li key={p.id} className="list-none"><PostCard p={p} /></li>)}</ul>
    </section>
  )
}

/** the owner's call to action at the end of an article */
export function TryCta() {
  return (
    <aside className="mt-14 rounded-3xl border-2 border-foreground bg-[#fffbe6] p-6 md:p-8 shadow-[4px_5px_0_0_#181b25] text-center">
      <p className="font-heading font-extrabold text-2xl text-foreground">Make your next presentation in minutes</p>
      <p className="mt-2 text-sm font-medium text-[#475569]">Describe it, or upload a PDF, picture or recording. SlidesDone builds a designed, editable deck.</p>
      <Link href="/signup" className="mt-5 inline-flex items-center gap-2 rounded-2xl border-2 border-foreground bg-accent px-6 py-3 font-heading font-extrabold text-sm uppercase tracking-wide text-white shadow-[3px_4px_0_0_#181b25]">Start free<ArrowRight aria-hidden size={16} /></Link>
    </aside>
  )
}
