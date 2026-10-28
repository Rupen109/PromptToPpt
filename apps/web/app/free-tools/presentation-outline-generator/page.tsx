import type { Metadata } from 'next'
import { OutlineTool } from '@/components/free-tools/OutlineTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free AI Presentation Outline Generator',
  description: 'Type your topic and get a clear slide-by-slide presentation outline in seconds. Free, no sign-up. Turn it into a finished deck with one click.',
  alternates: { canonical: '/free-tools/presentation-outline-generator' },
}

export default function Page() {
  return (
    <ToolShell
      title="Free AI Presentation Outline Generator"
      intro="Tell us your topic and who it is for. Get a slide-by-slide outline with a story that flows from the opening to the close, then turn it into a designed presentation."
      steps={[
        { title: 'Describe your topic', text: 'A few words are enough. Add your audience and the number of slides if you know them.' },
        { title: 'Get your outline', text: 'Every slide has a clear title and three supporting points, in an order that tells one story.' },
        { title: 'Make it a deck', text: 'One click opens the editor with your outline already filled in, ready to be designed.' },
      ]}
      faqs={[
        { q: 'Is the outline generator really free?', a: 'Yes. You can generate outlines without signing up. There is a daily limit per visitor so the tool stays free for everyone.' },
        { q: 'How many slides should my presentation have?', a: 'A good rule is about one slide per minute you will speak. For a 10-minute talk choose 8 to 10 slides; for a short pitch choose 5 to 7.' },
        { q: 'Can I edit the outline?', a: 'Copy it anywhere, or open it in the editor where every title and bullet can be changed before and after the slides are designed.' },
        { q: 'Does it make up numbers?', a: 'No. The outline is built from your topic and avoids inventing statistics, quotes or customer names.' },
      ]}
      related={[{ href: '/free-tools/pdf-to-presentation', label: 'PDF to presentation' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <OutlineTool />
    </ToolShell>
  )
}
