import type { Metadata } from 'next'
import { SitemapTool } from '@/components/free-tools/SitemapTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free Sitemap Generator — Create sitemap.xml Online',
  description: 'Generate a sitemap.xml for your website free. We visit your pages like a search-engine bot, respect robots.txt and noindex, and give you a file ready for Google. No sign-up.',
  alternates: { canonical: '/free-tools/sitemap-generator' },
}

export default function Page() {
  return (
    <ToolShell
      title="Free Sitemap Generator"
      intro="Type your website address and get a sitemap.xml that search engines understand. We visit your pages the way Google does, so the list only has pages that really exist."
      steps={[
        { title: 'Enter your website', text: 'Type the address of your home page. It must be a public website.' },
        { title: 'Choose the options', text: 'Pick how many pages to list and whether to add last-changed dates, how often pages change and page priority.' },
        { title: 'Download and submit', text: 'Upload sitemap.xml to your site, add it to robots.txt and submit it in Google Search Console.' },
      ]}
      faqs={[
        { q: 'What is a sitemap?', a: 'A sitemap.xml is a file that lists the pages of your website so search engines can find them faster, including pages that no link points to.' },
        { q: 'Does it follow robots.txt?', a: 'Yes. Pages that your robots.txt blocks, and pages marked noindex, are left out. If your site already has a sitemap, the pages in it are included too.' },
        { q: 'How many pages can it list?', a: 'Up to 200 pages per run, in the order of how close they are to your home page. For very large sites, use the sitemap tool of your website platform.' },
        { q: 'Why is a page I expected missing?', a: 'Pages are found by following links from your home page (and from your existing sitemap). A page that nothing links to, a page behind a login, or a page that needs JavaScript to show its links may not be found.' },
        { q: 'Is it free?', a: 'Yes, with no sign-up. To keep it fair for everyone there is a limit on how many sites one person can scan each hour.' },
      ]}
      related={[{ href: '/free-tools/pdf-to-jpg', label: 'PDF to JPG converter' }, { href: '/free-tools/presentation-outline-generator', label: 'Presentation outline generator' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <SitemapTool />
    </ToolShell>
  )
}
