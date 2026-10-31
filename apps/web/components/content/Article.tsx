import Link from 'next/link'
import { ArrowLeft, ArrowRight, Clock, ExternalLink } from '@prompttoppt/ui/icons'
import { Markdown } from '@prompttoppt/ui/markdown'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { API_URL } from '@/lib/env'
import { BASE_PATH, type Full, absImage, dateLabel, hrefOf, imageSrc, siteUrl } from '@/lib/content'
import { CopyLink } from './ShareLinks'
import { Related, TryCta } from './parts'

const LABEL = { blog: 'Blog', news: 'Tech news', guide: 'Guides' } as const

/** JSON-LD for search engines: the article itself and its breadcrumb */
function jsonLd(p: Full) {
  const url = siteUrl(hrefOf(p))
  return [
    { '@context': 'https://schema.org', '@type': p.kind === 'news' ? 'NewsArticle' : 'Article', headline: p.title, description: p.seoDescription || p.summary, image: absImage(p.coverUrl) ? [absImage(p.coverUrl)] : undefined, datePublished: p.publishedAt, dateModified: p.updatedAt, author: { '@type': 'Organization', name: p.authorName }, publisher: { '@type': 'Organization', name: 'SlidesDone' }, mainEntityOfPage: url },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl('/') }, { '@type': 'ListItem', position: 2, name: LABEL[p.kind], item: siteUrl(BASE_PATH[p.kind]) }, { '@type': 'ListItem', position: 3, name: p.title, item: url }] },
  ]
}

export function Article({ p }: { p: Full }) {
  const img = imageSrc(p.coverUrl)
  const isGuide = p.kind === 'guide'
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="px-5 md:px-10 py-10 md:py-14">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p)).replace(/</g, '\\u003c') }} />
        <div className={`mx-auto ${isGuide && p.headings.length > 1 ? 'max-w-[1060px] lg:grid lg:grid-cols-[1fr_240px] lg:gap-12' : 'max-w-[760px]'}`}>
          <article>
            <nav aria-label="Breadcrumb" className="mb-6 font-heading font-bold text-xs text-[#64748b]">
              <Link href={BASE_PATH[p.kind]} className="inline-flex items-center gap-1 hover:text-primary"><ArrowLeft aria-hidden size={14} />{LABEL[p.kind]}</Link>
              {isGuide && p.section && <span> / {p.section}</span>}
            </nav>
            <h1 className="font-heading font-extrabold text-3xl md:text-5xl leading-[1.1] text-foreground">{p.title}</h1>
            <p className="mt-4 text-lg leading-8 font-medium text-[#475569]">{p.summary}</p>
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-heading font-bold text-xs text-[#64748b]">
              <span>{p.authorName}</span>
              {p.publishedAt && <><span aria-hidden>·</span><time dateTime={p.publishedAt}>{dateLabel(p.publishedAt)}</time></>}
              {p.body.trim() && <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock aria-hidden size={12} />{p.readingMinutes} min read</span></>}
            </p>
            {p.tags.length > 0 && <ul className="mt-4 flex flex-wrap gap-2">{p.tags.map((t) => <li key={t} className="list-none"><Link href={`${BASE_PATH[p.kind]}?tag=${encodeURIComponent(t)}`} className="rounded-full bg-[#f1f5f9] px-3 py-1 font-heading font-bold text-xs text-[#475569] hover:bg-[#e2e8f0]">{t}</Link></li>)}</ul>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img && <img src={img} alt={p.coverAlt ?? ''} className="mt-8 w-full rounded-3xl border-2 border-foreground shadow-[4px_5px_0_0_#181b25] bg-[#f1f5f9]" />}
            {p.kind === 'news' && p.sourceUrl && (
              <p className="mt-6"><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-white px-4 py-2 font-heading font-bold text-sm text-foreground hover:bg-[#f8f9fc]">Read the original{p.sourceName ? ` on ${p.sourceName}` : ''}<ExternalLink aria-hidden size={14} /></a></p>
            )}
            {p.body.trim() && <div className="mt-8"><Markdown assetBase={API_URL}>{p.body}</Markdown></div>}
            <div className="mt-10 flex items-center gap-3"><CopyLink url={siteUrl(hrefOf(p))} /></div>

            {isGuide && (p.prev || p.next) && (
              <nav aria-label="More guides" className="mt-12 grid gap-4 sm:grid-cols-2">
                {p.prev ? <Link href={hrefOf(p.prev)} className="rounded-2xl border-2 border-foreground bg-white p-4 hover:bg-[#f8f9fc]"><span className="flex items-center gap-1 font-heading font-bold text-xs text-[#64748b]"><ArrowLeft aria-hidden size={12} />Previous</span><span className="mt-1 block font-heading font-extrabold text-foreground">{p.prev.title}</span></Link> : <span />}
                {p.next ? <Link href={hrefOf(p.next)} className="rounded-2xl border-2 border-foreground bg-white p-4 text-right hover:bg-[#f8f9fc]"><span className="flex items-center justify-end gap-1 font-heading font-bold text-xs text-[#64748b]">Next<ArrowRight aria-hidden size={12} /></span><span className="mt-1 block font-heading font-extrabold text-foreground">{p.next.title}</span></Link> : <span />}
              </nav>
            )}
            <TryCta />
            {!isGuide && <Related items={p.related} title={p.kind === 'news' ? 'More news' : 'Keep reading'} />}
          </article>
          {isGuide && p.headings.length > 1 && (
            <aside className="hidden lg:block">
              <nav aria-label="On this page" className="sticky top-28 rounded-2xl border-2 border-foreground bg-white p-4">
                <p className="font-heading font-extrabold text-xs uppercase tracking-wide text-foreground">On this page</p>
                <ul className="mt-3 space-y-2">
                  {p.headings.map((h) => <li key={h.id + h.text} className={`list-none ${h.level === 3 ? 'pl-3' : ''}`}><a href={`#${h.id}`} className="font-heading font-bold text-xs leading-5 text-[#475569] hover:text-primary">{h.text}</a></li>)}
                </ul>
              </nav>
            </aside>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
