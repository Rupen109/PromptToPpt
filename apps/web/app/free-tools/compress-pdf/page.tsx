import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { CompressPdfTool } from '@/components/free-tools/CompressPdfTool'
import { ToolShell } from '@/components/free-tools/ToolShell'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'

export const metadata: Metadata = withShare({
  title: 'Free Compress PDF — Reduce PDF File Size Online',
  description: 'Compress a PDF free: make it smaller for email and upload, with text kept sharp. Three levels; it runs in your browser and nothing is uploaded.',
  alternates: { canonical: '/free-tools/compress-pdf' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/compress-pdf"
      title="Free Compress PDF"
      intro="Make a PDF smaller for email, forms and sharing. Text stays sharp; only the photos are made smaller. Free, no sign-up, and nothing is uploaded."
      steps={[
        { title: 'Choose your PDF', text: `Drop in a PDF of up to ${mb(TOOL_LIMITS.maxBytes)}.` },
        { title: 'Pick a level', text: 'Light keeps the most detail, Recommended suits email, Strong gives the smallest file.' },
        { title: 'Download', text: 'See how much smaller it is, then download.' },
      ]}
      guide={[
        { title: 'How it makes a PDF smaller', paragraphs: ['Most of a big PDF is usually its photos. Each photo larger than the level allows is scaled down and saved again as a JPEG; a photo is only replaced when that makes it clearly smaller. Text, fonts, vector drawings and transparency stay exactly as they were, so text stays sharp at any zoom.'] },
        { title: 'Which level to choose', table: { head: ['Level', 'Photos up to', 'Best for'], rows: [['Light', '2400 px', 'Printing, keeping detail'], ['Recommended', '1600 px', 'Email, sharing, screens'], ['Strong', '1100 px', 'The smallest file, upload limits']] } },
        { title: 'Limits', points: [`Up to ${mb(TOOL_LIMITS.maxBytes)} per PDF.`, 'A PDF that is mostly text may already be as small as it gets; the tool tells you when that is the case.', 'Password-protected PDFs must be unlocked first.'] },
      ]}
      faqs={[
        { q: 'Is compressing a PDF free?', a: 'Yes. No sign-up, no watermark and no daily limit.' },
        { q: 'Is my PDF uploaded?', a: 'No. Compression happens in your browser.' },
        { q: 'Will the text get blurry?', a: 'No. Only photos are made smaller; text and drawings are kept as they are.' },
        { q: 'Why did my PDF not get smaller?', a: 'It has no large photos to shrink: text-only PDFs are usually already compact. Try Strong, or remove pages you do not need with Split PDF.' },
      ]}
      related={[{ href: '/free-tools/merge-pdf', label: 'Free merge PDF' }, { href: '/free-tools/split-pdf', label: 'Free split PDF' }, { href: '/free-tools/organize-pdf', label: 'Free organize PDF pages' }, { href: '/free-tools/pdf-to-jpg', label: 'Free PDF to JPG converter' }]}
    >
      <CompressPdfTool />
    </ToolShell>
  )
}
