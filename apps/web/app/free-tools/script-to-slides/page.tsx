import type { Metadata } from 'next'
import { ScriptTool } from '@/components/free-tools/ScriptTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free Script to Slides: Turn a Script into a Deck',
  description: 'Paste the script of your Reel, video, talk or podcast and get a slide-by-slide outline, then open it as an editable presentation. Free.',
  alternates: { canonical: '/free-tools/script-to-slides' },
}

export default function Page() {
  return (
    <ToolShell
      title="Turn a Video or Reel Script into Slides"
      intro="Paste the script or caption of your Reel, YouTube video, talk or podcast. AI turns each beat into a slide you can edit, present or share."
      steps={[
        { title: 'Paste your script', text: 'A Reel caption, a YouTube script, a speech or a podcast outline. Up to 6,000 characters.' },
        { title: 'Get the outline', text: 'One slide per beat, in your order, with the hook first and your call to action last. Your facts and numbers stay as you wrote them.' },
        { title: 'Open it in the editor', text: 'Turn the outline into a designed, editable presentation built from your own script.' },
      ]}
      faqs={[
        { q: 'Is this a video downloader?', a: 'No. It works from the script you paste. We do not download videos from Instagram, YouTube or any other site.' },
        { q: 'Will it change what I wrote?', a: 'It reorganises your script into slides and keeps your facts, names and numbers. It is told not to add facts you did not write.' },
        { q: 'How many slides do I get?', a: 'About one slide per minute of speaking, between 5 and 12, depending on the length of your script.' },
        { q: 'Is it free?', a: 'Yes, no sign-up is needed for the outline. There is a daily limit per visitor. Making the full designed deck uses the free plan credits.' },
        { q: 'What happens to my script?', a: 'It is read by AI for this request and removed within an hour if you do not continue. We do not train models on it.' },
      ]}
      related={[{ href: '/free-tools/video-to-slides', label: 'Audio & video to slides' }, { href: '/free-tools/youtube-transcript-to-slides', label: 'YouTube transcript to slides' }, { href: '/free-tools/presentation-outline-generator', label: 'Presentation outline generator' }]}
    >
      <ScriptTool />
    </ToolShell>
  )
}
