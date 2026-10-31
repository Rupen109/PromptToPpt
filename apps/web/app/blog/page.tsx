import type { Metadata } from 'next'
import { ContentPage, Empty, Pager, PostCard, TagBar, Unavailable } from '@/components/content/parts'
import { getTags, listPosts } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Blog — AI Presentations, Design and Storytelling',
  description: 'Practical articles on making better presentations with AI: structure, design, storytelling and the tools that save time.',
  alternates: { canonical: '/blog' },
}

export const revalidate = 60

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ tag?: string; page?: string }> }) {
  const sp = await searchParams
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? '1', 10) || 1))
  const tag = sp.tag?.slice(0, 30).toLowerCase()
  const [list, tags] = await Promise.all([listPosts('blog', { page, ...(tag ? { tag } : {}), pageSize: 12 }), getTags('blog')])
  return (
    <ContentPage eyebrow="The SlidesDone blog" title="Ideas for better presentations" intro="Practical articles on structure, design and storytelling, and how to get a great deck done in less time.">
      {!list.ok ? <Unavailable what="blog" /> : (
        <>
          {tags.ok && <TagBar kind="blog" tags={tags.data} {...(tag ? { active: tag } : {})} />}
          {list.data.items.length === 0 ? <Empty>{tag ? `No articles about “${tag}” yet.` : 'The first articles are coming soon.'}</Empty> : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {list.data.items.map((p, i) => <li key={p.id} className={`list-none ${i === 0 && p.featured && page === 1 && !tag ? 'md:col-span-2 lg:col-span-3' : ''}`}><PostCard p={p} big={i === 0 && p.featured && page === 1 && !tag} /></li>)}
            </ul>
          )}
          <Pager kind="blog" page={list.data.page} pages={list.data.pages} {...(tag ? { tag } : {})} />
        </>
      )}
    </ContentPage>
  )
}
