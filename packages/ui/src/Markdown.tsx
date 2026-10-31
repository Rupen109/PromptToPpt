import type { ComponentProps, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Same rule as the API's `headings()` so the "On this page" links match the ids on the page. */
export const headingId = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
const plain = (n: ReactNode): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(plain).join('') : n && typeof n === 'object' && 'props' in n ? plain((n as { props: { children?: ReactNode } }).props.children) : '')

/**
 * The owner's Markdown (blog, news, guides) as safe HTML: raw HTML in the text is NOT rendered (it shows as text), links open safely,
 * pictures uploaded in the dashboard (/api/v1/content/images/…) are loaded from the API. Styled by prose.css (class "sd-prose").
 */
export function Markdown({ children, assetBase = '' }: { children: string; assetBase?: string }) {
  const external = (href?: string) => !!href && /^https?:\/\//i.test(href)
  return (
    <div className="sd-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children: c }) => <h2 id={headingId(plain(c))}>{c}</h2>,
          h3: ({ children: c }) => <h3 id={headingId(plain(c))}>{c}</h3>,
          a: ({ href, children: c }: ComponentProps<'a'>) => (external(href) ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a> : <a href={href}>{c}</a>),
          img: ({ src, alt }: ComponentProps<'img'>) => {
            const s = typeof src === 'string' ? src : ''
            const url = s.startsWith('/api/v1/content/images/') ? `${assetBase}${s}` : /^https:\/\//i.test(s) ? s : ''
            // eslint-disable-next-line @next/next/no-img-element
            return url ? <img src={url} alt={alt ?? ''} loading="lazy" /> : null
          },
          table: ({ children: c }) => <div className="sd-table"><table>{c}</table></div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
