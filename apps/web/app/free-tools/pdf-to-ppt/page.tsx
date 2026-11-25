import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { PdfToPptTool } from '@/components/free-tools/PdfToPptTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = withShare({
  title: 'Free PDF to PPT Converter — Online, No Sign-up',
  description: 'Free PDF to PPT and PDF to PowerPoint converter: get a .pptx in your browser, with the exact look or editable text. Your file is not uploaded.',
  alternates: { canonical: '/free-tools/pdf-to-ppt' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/pdf-to-ppt"
      title="Free PDF to PPT Converter"
      intro="Convert a PDF to PowerPoint (.pptx) online, free, with no sign-up and no watermark. It runs on your device, so your document is not uploaded. Want something that looks professionally designed? One click hands it to our AI."
      steps={[
        { title: 'Choose your PDF', text: 'Drop in a report, a set of notes or a presentation you only have as a PDF. Up to 60 pages.' },
        { title: 'Pick how it converts', text: 'Exact look keeps every page as it is. Editable text turns the words into text boxes you can change.' },
        { title: 'Download or redesign', text: 'Download the .pptx, or let AI rebuild the content as a clean, designed presentation you can edit and present.' },
      ]}
      guide={[
        {
          title: 'Exact look or editable text: which PDF to PPT mode to choose',
          paragraphs: ['A PDF stores where every letter sits on the page, not paragraphs and layouts, so a PDF to PowerPoint converter has to choose between keeping the look and making the words editable. This one lets you pick:'],
          table: {
            head: ['', 'Exact look', 'Editable text'],
            rows: [
              ['Each slide is', 'a picture of the PDF page', 'text boxes in the same places as on the page'],
              ['Edit the words in PowerPoint', 'No', 'Yes'],
              ['Pictures, charts and shapes', 'Kept exactly (they are part of the page picture)', 'Not carried over'],
              ['Scanned PDFs', 'Yes', 'No: it needs a PDF with selectable text'],
              ['Best for', 'Presenting or sharing a PDF as slides, unchanged', 'Reusing and rewriting the text of a PDF'],
            ],
          },
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
          points: ['Up to 60 pages and 30 MB per PDF.', 'No daily limit: convert as many files as you like.', 'The .pptx opens in PowerPoint, and in apps that open PowerPoint files, such as Google Slides and Keynote.'],
        },
      ]}
      faqs={[
        { q: 'Is this PDF to PPT converter really free?', a: 'Yes. Converting a PDF to PowerPoint is free, with no sign-up, no watermark and no daily limit. Only the optional AI redesign needs a free account.' },
        { q: 'Do I need to sign up or install anything?', a: 'No. Open the page, choose your PDF and download the .pptx. It works in any modern browser on Windows, Mac, Linux and ChromeOS.' },
        { q: 'Is my PDF uploaded anywhere?', a: 'No. The conversion happens in your browser. The file only leaves your device if you choose "Redesign it with AI", which uploads it so the AI can read it.' },
        { q: 'Will the PowerPoint be editable?', a: 'In "Editable text" mode, yes: the text becomes text boxes. Pictures and graphics are not carried over in that mode. In "Exact look" mode every page is a picture, so it matches the PDF but the text cannot be edited.' },
        { q: 'Why does my converted file look different from the PDF?', a: 'PDFs describe where each letter sits on a page, not paragraphs and layouts, so any converter has to guess. Exact look avoids guessing; for a better editable result, use the AI redesign instead.' },
        { q: 'Does it work with scanned PDFs?', a: 'Exact look works with any PDF, including scans. Editable text needs a PDF with selectable text.' },
      ]}
      related={[{ href: '/free-tools/pdf-editor', label: 'Free PDF editor' }, { href: '/free-tools/pdf-to-presentation', label: 'Free AI PDF to presentation' }, { href: '/free-tools/presentation-outline-generator', label: 'Free presentation outline generator' }, { href: '/templates', label: 'Free presentation templates' }]}
    >
      <PdfToPptTool />
    </ToolShell>
  )
}
