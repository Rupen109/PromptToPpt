import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import { ToolShell } from '@/components/free-tools/ToolShell'
import { TranscriptTool } from '@/components/free-tools/TranscriptTool'

export const metadata: Metadata = withShare({
  title: 'Free YouTube Transcript to Slides Converter',
  description: 'YouTube to PPT, free: paste a transcript, clean out time stamps and repeats, then turn it into a designed, editable presentation. No sign-up.',
  alternates: { canonical: '/free-tools/youtube-transcript-to-slides' },
})

export default function Page() {
  return (
    <ToolShell
      path="/free-tools/youtube-transcript-to-slides"
      title="YouTube Transcript to Slides"
      intro="Copy a video’s transcript from YouTube, paste it here, and get clean text you can copy, download, or turn into a presentation in one click."
      steps={[
        { title: 'Copy the transcript', text: 'On YouTube open the description (click …more under the title), scroll to the bottom, click Show transcript, then select the text in the panel and copy it. Caption files (.srt, .vtt) work too.' },
        { title: 'Paste and clean', text: 'We remove repeats, tags and [Music] lines and keep the time stamps, so you can see where each part comes from.' },
        { title: 'Make slides', text: 'Open the transcript in the editor and get a designed, editable deck that summarises the video.' },
      ]}
      faqs={[
        { q: 'Can I just paste a YouTube link?', a: 'Not yet. YouTube does not let apps read a video’s captions automatically, so we ask you to copy the transcript from YouTube’s own “Show transcript” panel. It takes a few seconds and works for any video that has captions.' },
        { q: 'Is it free?', a: 'Yes. Cleaning, copying and downloading the transcript is free with no sign-up. Making the full deck uses the free plan’s credits.' },
        { q: 'What happens to my transcript?', a: 'It is kept for one hour so the editor can use it, and removed if you do not continue. We do not train models on it.' },
        { q: 'Does it work for videos without captions?', a: 'You need some text to start from. Many videos have automatic captions; if a video has none, there is no transcript to copy.' },
      ]}
      related={[{ href: '/free-tools/pdf-to-presentation', label: 'Free PDF to presentation' }, { href: '/free-tools/presentation-outline-generator', label: 'Free presentation outline generator' }, { href: '/templates', label: 'Free presentation templates' }]}
    >
      <TranscriptTool />
    </ToolShell>
  )
}
