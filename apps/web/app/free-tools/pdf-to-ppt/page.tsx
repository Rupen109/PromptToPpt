import type { Metadata } from 'next'
import { PdfToPptTool } from '@/components/free-tools/PdfToPptTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free PDF to PPT Converter — Online, No Sign-up',
  description: 'Convert a PDF to a PowerPoint (.pptx) file free, right in your browser. Keep the exact look or get editable text. Your file is not uploaded.',
  alternates: { canonical: '/free-tools/pdf-to-ppt' },
}

export default function Page() {
  return (
    <ToolShell
      title="Free PDF to PPT Converter"
      intro="Turn a PDF into a PowerPoint file in seconds. It runs on your device, so your document is not uploaded. Want something that looks professionally designed? One click hands it to our AI."
      steps={[
        { title: 'Choose your PDF', text: 'Drop in a report, a set of notes or a presentation you only have as a PDF. Up to 60 pages.' },
        { title: 'Pick how it converts', text: 'Exact look keeps every page as it is. Editable text turns the words into text boxes you can change.' },
        { title: 'Download or redesign', text: 'Download the .pptx, or let AI rebuild the content as a clean, designed presentation you can edit and present.' },
      ]}
      faqs={[
        { q: 'Is my PDF uploaded anywhere?', a: 'No. The conversion happens in your browser. The file only leaves your device if you choose "Redesign it with AI", which uploads it so the AI can read it.' },
        { q: 'Will the PowerPoint be editable?', a: 'In "Editable text" mode, yes: the text becomes text boxes. Pictures and graphics are not carried over in that mode. In "Exact look" mode every page is a picture, so it matches the PDF but the text cannot be edited.' },
        { q: 'Why does my converted file look different from the PDF?', a: 'PDFs describe where each letter sits on a page, not paragraphs and layouts, so any converter has to guess. Exact look avoids guessing; for a better editable result, use the AI redesign instead.' },
        { q: 'Does it work with scanned PDFs?', a: 'Exact look works with any PDF, including scans. Editable text needs a PDF with selectable text.' },
      ]}
      related={[{ href: '/free-tools/pdf-to-presentation', label: 'AI PDF to presentation' }, { href: '/free-tools/presentation-outline-generator', label: 'Presentation outline generator' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <PdfToPptTool />
    </ToolShell>
  )
}
