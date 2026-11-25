import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { MergePdfTool } from '@/components/free-tools/MergePdfTool'
import { ToolShell } from '@/components/free-tools/ToolShell'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'

export const metadata: Metadata = withShare({
  title: 'Free Merge PDF — Combine PDF Files Online, No Sign-up',
  description: 'Merge PDF files into one, free: put them in any order and download a single PDF. It runs in your browser, so your files are not uploaded.',
  alternates: { canonical: '/free-tools/merge-pdf' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/merge-pdf"
      title="Free Merge PDF"
      intro="Combine several PDF files into one, in the order you choose. Free, no sign-up, no watermark, and it runs on your device, so your files are not uploaded."
      steps={[
        { title: 'Add your PDFs', text: `Drop in up to ${TOOL_LIMITS.mergeFiles} PDFs. You can add more at any time.` },
        { title: 'Put them in order', text: 'Drag a file, or use the arrows, to set the order. Remove any you do not need.' },
        { title: 'Merge and download', text: 'Get one PDF with every page, in your order.' },
      ]}
      guide={[
        { title: 'What stays the same', points: ['Every page is copied as it is: text stays selectable and searchable, links and fonts are kept.', 'Pages keep their own size and orientation, so a landscape page stays landscape.', 'No watermark and no extra pages are added.'] },
        { title: 'Limits', points: [`Up to ${TOOL_LIMITS.mergeFiles} PDFs and ${mb(TOOL_LIMITS.mergeBytes)} together, ${TOOL_LIMITS.maxPages} pages in the merged file.`, 'Password-protected PDFs must be unlocked first.', 'No daily limit.'] },
      ]}
      faqs={[
        { q: 'Is merging PDFs really free?', a: 'Yes. No sign-up, no watermark and no daily limit.' },
        { q: 'Are my PDFs uploaded?', a: 'No. The merge happens in your browser, so your files never leave your device.' },
        { q: 'Can I change the order of the files?', a: 'Yes. Drag a file to a new place, or use the up and down arrows next to it.' },
        { q: 'Will the text still be selectable?', a: 'Yes. Pages are copied, not turned into pictures, so text, links and fonts stay as they were.' },
        { q: 'Can I merge only some pages of a PDF?', a: 'Take the pages you need with Split PDF (Extract pages) first, then merge the result.' },
      ]}
      related={[{ href: '/free-tools/split-pdf', label: 'Free split PDF' }, { href: '/free-tools/organize-pdf', label: 'Free organize PDF pages' }, { href: '/free-tools/compress-pdf', label: 'Free compress PDF' }, { href: '/free-tools/pdf-editor', label: 'Free PDF editor' }]}
    >
      <MergePdfTool />
    </ToolShell>
  )
}
