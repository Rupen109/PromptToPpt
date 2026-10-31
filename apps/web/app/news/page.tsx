import type { Metadata } from 'next'
import { Flame } from '@prompttoppt/ui/icons'
import { ContentPage, Empty, NewsItem, Pager, TagBar, Unavailable } from '@/components/content/parts'
import { getTags, getTrending, listPosts } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Tech News — Short Daily AI and Software Updates',
  description: 'Short, clear tech and AI news in plain words, with a link to the original story. Updated by the SlidesDone team.',
  alternates: { canonical: '/news' },
}

export const revalidate = 60

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tag?: string; page?: string }> }) {
  const sp = await searchParams
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? '1', 10) || 1))
  const tag = sp.tag?.slice(0, 30).toLowerCase()
  const [list, tags, trending] = await Promise.all([listPosts('news', { page, ...(tag ? { tag } : {}), pageSize: 20 }), getTags('news'), getTrending()])
  const showTrending = trending.ok && trending.data.length > 0 && page === 1 && !tag
  return (
    <ContentPage eyebrow="Tech news" title="Tech news in a minute" intro="Short, clear updates from the world of AI and software, each with a link to the original story.">
      {!list.ok ? <Unavailable what="news" /> : (
        <>
          {showTrending && trending.ok && (
            <section aria-labelledby="trending" className="mb-12">
              <h2 id="trending" className="flex items-center gap-2 font-heading font-extrabold text-2xl text-foreground"><Flame aria-hidden size={22} className="text-accent" />Trending now</h2>
              <ul className="mt-5 grid gap-4 md:grid-cols-2">{trending.data.slice(0, 4).map((p) => <li key={p.id} className="list-none"><NewsItem p={p} /></li>)}</ul>
            </section>
          )}
          {tags.ok && <TagBar kind="news" tags={tags.data} {...(tag ? { active: tag } : {})} />}
          {list.data.items.length === 0 ? <Empty>{tag ? `No news about “${tag}” yet.` : 'The first news items are coming soon.'}</Empty> : (
            <>
              <h2 className="sr-only">Latest</h2>
              <ul className="grid gap-4">{list.data.items.map((p) => <li key={p.id} className="list-none"><NewsItem p={p} /></li>)}</ul>
            </>
          )}
          <Pager kind="news" page={list.data.page} pages={list.data.pages} {...(tag ? { tag } : {})} />
        </>
      )}
    </ContentPage>
  )
}
