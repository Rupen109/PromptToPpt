import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { OrganizePdfTool } from '@/components/free-tools/OrganizePdfTool'
import { ToolShell } from '@/components/free-tools/ToolShell'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'

export const metadata: Metadata = withShare({
  title: 'Free Organize PDF Pages — Reorder, Rotate, Delete Online',
  description: 'Organize PDF pages free: see every page, drag to reorder, rotate and delete pages, then download. In your browser; nothing is uploaded.',
  alternates: { canonical: '/free-tools/organize-pdf' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/organize-pdf"
      title="Free Organize PDF Pages"
      intro="Put the pages of a PDF in the right order, turn the sideways ones and remove the ones you do not need, seeing every page as you go. Free, and nothing is uploaded."
      steps={[
        { title: 'Choose your PDF', text: `Drop in a PDF of up to ${TOOL_LIMITS.organizePages} pages. A picture of every page appears.` },
        { title: 'Arrange the pages', text: 'Drag a page to move it, rotate it left or right, or delete it.' },
        { title: 'Save', text: 'Download the PDF with the pages as you arranged them.' },
      ]}
      guide={[
        { title: 'What you can do', points: ['Move pages by dragging, or with the arrows (also with the keyboard).', 'Rotate a page left or right; turning is lossless, the page is not redrawn.', 'Delete pages you do not need.', 'Start again from the original order at any time before you save.'] },
        { title: 'Limits', points: [`Up to ${TOOL_LIMITS.organizePages} pages and ${mb(TOOL_LIMITS.maxBytes)}. For longer PDFs, split first.`, 'Text, links and fonts are kept.', 'Password-protected PDFs must be unlocked first.'] },
      ]}
      faqs={[
        { q: 'Is it free?', a: 'Yes. No sign-up, no watermark and no daily limit.' },
        { q: 'Is my PDF uploaded?', a: 'No. Everything happens in your browser.' },
        { q: 'Does rotating a page lower its quality?', a: 'No. The page is turned, not redrawn, so text and pictures stay exactly as they were.' },
        { q: 'Can I edit the text on a page too?', a: 'Yes, with our free PDF editor.' },
      ]}
      related={[{ href: '/free-tools/merge-pdf', label: 'Free merge PDF' }, { href: '/free-tools/split-pdf', label: 'Free split PDF' }, { href: '/free-tools/pdf-editor', label: 'Free PDF editor' }, { href: '/free-tools/compress-pdf', label: 'Free compress PDF' }]}
      wide
    >
      <OrganizePdfTool />
    </ToolShell>
  )
}
