import type { Metadata } from 'next'
import { PdfToJpgTool } from '@/components/free-tools/PdfToJpgTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free PDF to JPG Converter — Online, No Sign-up',
  description: 'Convert PDF pages to JPG pictures free, right in your browser. Pick the quality and the pages, download one by one or all in a zip. Your file is not uploaded.',
  alternates: { canonical: '/free-tools/pdf-to-jpg' },
}

export default function Page() {
  return (
    <ToolShell
      title="Free PDF to JPG Converter"
      intro="Turn every page of a PDF into a JPG picture in seconds. It runs on your device, so your document is not uploaded and there is nothing to install."
      steps={[
        { title: 'Choose your PDF', text: 'Drop in a report, a slide deck or a scan. Up to 60 pages.' },
        { title: 'Pick quality and pages', text: 'Standard for screens, High for sharp text, Maximum for printing. Convert every page, or just some, like 1-3, 7.' },
        { title: 'Download', text: 'Save a single page, or all of them together in one zip file.' },
      ]}
      faqs={[
        { q: 'Is my PDF uploaded anywhere?', a: 'No. The conversion happens in your browser, so the file never leaves your device.' },
        { q: 'How do I convert only some pages?', a: 'Type the pages in the "Pages" box, for example 1-3, 7. Leave it empty to convert every page.' },
        { q: 'Which quality should I choose?', a: 'Standard is smallest and fine for screens and email. High is about A4 at 150 dpi. Maximum is for printing or zooming in; its files are the biggest.' },
        { q: 'Are there limits?', a: 'PDFs up to 30 MB and 60 pages. Password-protected PDFs must be unlocked first.' },
        { q: 'Can I turn the PDF into slides instead?', a: 'Yes. Use our PDF to PPT converter, or let AI turn it into a designed presentation.' },
      ]}
      related={[{ href: '/free-tools/pdf-to-ppt', label: 'PDF to PPT converter' }, { href: '/free-tools/pdf-to-presentation', label: 'AI PDF to presentation' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <PdfToJpgTool />
    </ToolShell>
  )
}
