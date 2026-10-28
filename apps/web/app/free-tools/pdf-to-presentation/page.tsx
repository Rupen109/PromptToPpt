import type { Metadata } from 'next'
import { PdfTool } from '@/components/free-tools/PdfTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free PDF to Presentation Converter with AI',
  description: 'Turn any PDF into a presentation with AI. Get a summary and a slide-by-slide outline in seconds, then open a designed, editable deck. Free, no sign-up.',
  alternates: { canonical: '/free-tools/pdf-to-presentation' },
}

export default function Page() {
  return (
    <ToolShell
      title="Turn a PDF into a Presentation with AI"
      intro="Upload a report, paper or plan. AI reads it, pulls out what matters and lays it out as slides you can edit and present."
      steps={[
        { title: 'Upload your PDF', text: 'Reports, research papers, business plans or course notes. Text PDFs up to 5 MB.' },
        { title: 'Choose the result', text: 'A professional presentation, a summary in slides, an executive briefing, an academic talk or a business deck.' },
        { title: 'Open it in the editor', text: 'Get the summary and slide outline instantly, then make a designed, editable deck from the same document.' },
      ]}
      faqs={[
        { q: 'Is this a plain PDF to PowerPoint converter?', a: 'No. It reads your document, understands it and restructures it into slides, which usually gives a much better presentation than copying pages into slides.' },
        { q: 'Is it free?', a: 'Yes, no sign-up needed to get your summary and outline. There is a daily limit per visitor. Making the full designed deck uses the free plan credits.' },
        { q: 'What happens to my PDF?', a: 'It is read for this request and removed within an hour if you do not continue. We do not train models on it.' },
        { q: 'Which PDFs work best?', a: 'PDFs with selectable text. Scanned image-only PDFs are not supported yet.' },
      ]}
      related={[{ href: '/free-tools/presentation-outline-generator', label: 'Presentation outline generator' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <PdfTool />
    </ToolShell>
  )
}
