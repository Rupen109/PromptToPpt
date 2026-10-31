import type { Metadata } from 'next'
import { MediaTool } from '@/components/free-tools/MediaTool'
import { ToolShell } from '@/components/free-tools/ToolShell'

export const metadata: Metadata = {
  title: 'Free Audio & Video to Slides Converter',
  description: 'Upload a lecture, meeting or voice recording, get a timed transcript in its own language, then turn it into an editable presentation. Free to try.',
  alternates: { canonical: '/free-tools/video-to-slides' },
}

export default function Page() {
  return (
    <ToolShell
      title="Turn a Recording into Slides"
      intro="Upload your own lecture, meeting, voice note or screen recording. AI writes down what is said and you can turn it into a presentation in one click."
      steps={[
        { title: 'Upload your recording', text: 'MP3, M4A, WAV, OGG, FLAC or AAC audio, or an MP4, MOV or WebM video. Up to 4 MB free, about 4 minutes of audio.' },
        { title: 'Get the transcript', text: 'It is written in the language that is spoken, with time stamps. Copy it or download it as a text file.' },
        { title: 'Make slides', text: 'Open the transcript in the editor and get a designed, editable deck that summarises the recording.' },
      ]}
      faqs={[
        { q: 'Which languages work?', a: 'Most widely spoken languages, including English, Hindi and many others. The transcript is written in the language that is spoken and is not translated.' },
        { q: 'How long can the recording be?', a: 'Free visitors can use files up to 4 MB, about four minutes of ordinary audio. Signed-in customers can use files up to 12 MB. A video file is larger than its audio, so exporting just the audio (MP3 or M4A) lets you fit much more.' },
        { q: 'Is it free?', a: 'Yes, you can try a few recordings a day without an account. Signing up gives 100 free credits; a recording costs 6 credits for each 4 MB.' },
        { q: 'What happens to my recording?', a: 'It is sent to our AI provider to be transcribed and is not stored by us. The text is kept for one hour so the editor can use it, and removed if you do not continue. We do not train models on it.' },
        { q: 'Can I use a video from YouTube or Instagram?', a: 'This tool is for recordings you made or have the right to use. We do not download videos from other websites.' },
      ]}
      related={[{ href: '/free-tools/youtube-transcript-to-slides', label: 'YouTube transcript to slides' }, { href: '/free-tools/pdf-to-presentation', label: 'PDF to presentation' }, { href: '/templates', label: 'Presentation templates' }]}
    >
      <MediaTool />
    </ToolShell>
  )
}
