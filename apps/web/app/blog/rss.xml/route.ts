import { rssFor } from '@/lib/rss'

export const revalidate = 300
export const GET = () => rssFor('blog', '/blog')
