import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Article } from '@/components/content/Article'
import { Unavailable, ContentPage } from '@/components/content/parts'
import { getPost } from '@/lib/content'
import { articleMetadata } from '@/lib/content-meta'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await getPost('news', (await params).slug)
  return articleMetadata(r.ok ? r.data : null, 'news')
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getPost('news', (await params).slug)
  if (!r.ok) {
    if (r.status === 404) notFound()
    return <ContentPage eyebrow="Tech news" title="Back soon"><Unavailable what="article" /></ContentPage>
  }
  return <Article p={r.data} />
}
