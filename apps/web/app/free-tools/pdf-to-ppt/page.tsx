import { PPT_MAX_BYTES, PPT_MAX_PAGES } from '@/lib/pdf-limits'
import { SOURCE_MAX_BYTES } from '@prompttoppt/validation'
import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { PdfToPptTool } from '@/components/free-tools/PdfToPptTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = withShare({
  title: 'Free PDF to PPT Converter — Online, No Sign-up',
  description: 'Free PDF to PPT and PDF to PowerPoint converter: get an editable .pptx in your browser, with the text as real text boxes. Your file is not uploaded.',
  alternates: { canonical: '/free-tools/pdf-to-ppt' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/pdf-to-ppt"
      title="Free PDF to PPT Converter"
      intro="Convert a PDF to PowerPoint (.pptx) online, free, with no sign-up and no watermark. It runs on your device, so your document is not uploaded. Want something that looks professionally designed? One click hands it to our AI."
      steps={[
        { title: 'Choose your PDF', text: `Drop in a report, a set of notes or a presentation you only have as a PDF. Up to ${PPT_MAX_PAGES} pages.` },
        { title: 'Convert', text: 'Each page becomes a slide, and its text becomes text boxes in the same places, ready to edit.' },
        { title: 'Download or redesign', text: 'Download the .pptx right there, or let AI rebuild the content as a clean, designed presentation you can edit and present.' },
      ]}
      guide={[
        {
          title: 'What you get: an editable PowerPoint',
          paragraphs: ['A PDF stores where every letter sits on the page, not paragraphs and layouts. This converter rebuilds the words as PowerPoint text boxes in the same places, so you can change, move and restyle them:'],
          points: [
            'One slide per page, the same size as the PDF page.',
            'Every block of text becomes a text box you can edit.',
            'Pictures, charts and shapes are not carried over: add your own in PowerPoint, or use the AI redesign below.',
            'Scanned PDFs (pictures of pages, with no selectable text) have no text to carry over.',
          ],
        },
        {
          title: 'Your PDF stays on your device',
          paragraphs: [
            'The conversion runs in your browser, so the PDF is never uploaded to a server. That matters for contracts, reports and anything confidential. You can close the page and nothing is kept.',
            'The only exception is the AI redesign below: to read your document, the AI needs it, so choosing that option uploads the file.',
          ],
        },
        {
          title: 'Turn a PDF into a designed presentation with AI',
          paragraphs: ['A plain PDF to PPT conversion keeps the PDF layout, which was made for reading, not presenting. "Redesign it with AI" reads the document and builds a real presentation instead: a slide-by-slide story with headings and short points, a matching design, and slides you can edit in the browser.'],
          points: [
            'Free to try with a free SlidesDone account.',
            'Downloading the redesigned deck as PowerPoint or PDF is part of the paid plans.',
            'The plain conversion above stays free, with no account at all.',
          ],
        },
        {
          title: 'Limits',
          points: [`Up to ${PPT_MAX_PAGES} pages and ${PPT_MAX_BYTES / 1024 / 1024} MB per PDF.`, `The optional AI redesign reads PDFs up to ${SOURCE_MAX_BYTES.pdf / 1024 / 1024} MB.`, 'No daily limit: convert as many files as you like.', 'The .pptx opens in PowerPoint, and in apps that open PowerPoint files, such as Google Slides and Keynote.'],
        },
      ]}
      faqs={[
        { q: 'Is this PDF to PPT converter really free?', a: 'Yes. Converting a PDF to PowerPoint is free, with no sign-up, no watermark and no daily limit. Only the optional AI redesign needs a free account.' },
        { q: 'Do I need to sign up or install anything?', a: 'No. Open the page, choose your PDF and download the .pptx. It works in any modern browser on Windows, Mac, Linux and ChromeOS.' },
        { q: 'Is my PDF uploaded anywhere?', a: 'No. The conversion happens in your browser. The file only leaves your device if you choose "Redesign it with AI", which uploads it so the AI can read it.' },
        { q: 'Will the PowerPoint be editable?', a: 'Yes. The text of every page becomes text boxes you can edit in PowerPoint, Google Slides or Keynote. Pictures and graphics are not carried over.' },
        { q: 'Why does my converted file look different from the PDF?', a: 'PDFs describe where each letter sits on a page, not paragraphs and layouts, so any converter has to guess where text boxes begin and end, and pictures are not carried over. For a clean, designed result, use the AI redesign instead.' },
        { q: 'Does it work with scanned PDFs?', a: 'Not well: a scanned PDF is a picture of each page, with no text to turn into text boxes. It works with PDFs whose text you can select.' },
      ]}
      related={[{ href: '/free-tools/pdf-editor', label: 'Free PDF editor' }, { href: '/free-tools/pdf-to-presentation', label: 'Free AI PDF to presentation' }, { href: '/free-tools/presentation-outline-generator', label: 'Free presentation outline generator' }, { href: '/templates', label: 'Free presentation templates' }]}
    >
      <PdfToPptTool />
    </ToolShell>
  )
}
