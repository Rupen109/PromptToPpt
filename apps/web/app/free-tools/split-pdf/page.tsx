import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { SplitPdfTool } from '@/components/free-tools/SplitPdfTool'
import { ToolShell } from '@/components/free-tools/ToolShell'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'

export const metadata: Metadata = withShare({
  title: 'Free Split PDF — Separate or Extract PDF Pages Online',
  description: 'Split a PDF free: every page as its own PDF, custom page ranges, or extract the pages you pick into one file. In your browser; nothing is uploaded.',
  alternates: { canonical: '/free-tools/split-pdf' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/split-pdf"
      title="Free Split PDF"
      intro="Split a PDF into several files, or take out just the pages you need. Free, no sign-up, and it runs on your device, so your document is not uploaded."
      steps={[
        { title: 'Choose your PDF', text: `Drop in a PDF of up to ${TOOL_LIMITS.maxPages} pages.` },
        { title: 'Pick how to split', text: 'Every page as its own PDF, custom ranges like 1-3, 4-6, or the pages you pick in one PDF.' },
        { title: 'Download', text: 'One PDF, or several together in a zip file.' },
      ]}
      guide={[
        { title: 'Three ways to split', points: ['Every page: one PDF per page.', 'Custom ranges: type ranges such as 1-3, 4-6, 7- and each becomes its own PDF ("7-" means page 7 to the end).', 'Extract pages: the pages you list, such as 1, 3, 5-8, together in one PDF.'] },
        { title: 'Limits', points: [`Up to ${TOOL_LIMITS.maxPages} pages and ${mb(TOOL_LIMITS.maxBytes)} per PDF.`, 'Pages are copied as they are: text, links and fonts are kept.', 'Password-protected PDFs must be unlocked first.'] },
      ]}
      faqs={[
        { q: 'Is splitting a PDF free?', a: 'Yes. No sign-up, no watermark and no daily limit.' },
        { q: 'Is my PDF uploaded?', a: 'No. Splitting happens in your browser, so the file never leaves your device.' },
        { q: 'How do I take out a few pages?', a: 'Choose "Extract pages" and type the pages, for example 2, 5-7. You get one PDF with just those pages.' },
        { q: 'How do I get several files?', a: 'Choose "Every page" or "Custom ranges". The PDFs download together as one zip file.' },
      ]}
      related={[{ href: '/free-tools/merge-pdf', label: 'Free merge PDF' }, { href: '/free-tools/organize-pdf', label: 'Free organize PDF pages' }, { href: '/free-tools/compress-pdf', label: 'Free compress PDF' }, { href: '/free-tools/pdf-to-ppt', label: 'Free PDF to PPT converter' }]}
    >
      <SplitPdfTool />
    </ToolShell>
  )
}
