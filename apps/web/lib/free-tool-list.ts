import type { CardTone } from '@/components/ui/Card'

/**
 * THE list of free tools (and the templates card that leads the tools page): the tools page, the sitemap and llms.txt all read it, so a new tool is listed
 * everywhere at once. `href` is the tool's page; `text` is its one-line job (also what answer engines get).
 */
export interface Tool { href: string; badge: string; name: string; text: string; points: string[]; tone: CardTone }

/** Templates always come first. Three cards fill the first row; the fourth sits centred under them. Same card design for all four. */
export const TOOL_CARDS: Tool[] = [
  { href: '/templates', badge: 'Templates', name: 'Free Presentation Templates', text: 'Designed templates. Edit online, let AI fill them in.', points: ['Pitch, sales, marketing, strategy…', 'Edit and present from your browser', 'First 3 designs per collection free'], tone: 'mist' },
  { href: '/free-tools/pdf-editor', badge: 'New · In your browser', name: 'Free PDF Editor', text: 'Edit a PDF online. Nothing is uploaded.', points: ['Change text, add text, whiteout, highlight', 'Sign, draw, add shapes and pictures', 'Rotate, reorder and delete pages'], tone: 'yellow' },
  { href: '/free-tools/presentation-outline-generator', badge: 'AI · Free', name: 'AI Presentation Outline Generator', text: 'Your topic in, a clear slide-by-slide outline out.', points: ['Pick the type, audience and length', 'A story that flows from open to close', 'One click turns it into a full deck'], tone: 'cream' },
  { href: '/free-tools/pdf-to-presentation', badge: 'AI · Free', name: 'PDF to Presentation', text: 'Turn a report or paper into a summary and slides.', points: ['Summary, key points and slide outline', 'Executive, academic, business and more', 'Continue as an editable designed deck'], tone: 'lavender' },
  { href: '/free-tools/pdf-to-ppt', badge: 'In your browser', name: 'PDF to PPT Converter', text: 'Convert a PDF to a PowerPoint file. Nothing is uploaded.', points: ['Exact look, or editable text boxes', 'Up to 60 pages, no sign-up', 'Download the .pptx instantly'], tone: 'peach' },
  { href: '/free-tools/pdf-to-jpg', badge: 'In your browser', name: 'PDF to JPG Converter', text: 'Turn PDF pages into pictures. Nothing is uploaded.', points: ['Standard, high or maximum quality', 'All pages, or only the ones you pick', 'Download one by one or as a zip'], tone: 'white' },
  { href: '/free-tools/sitemap-generator', badge: 'Free', name: 'Sitemap Generator', text: 'Get a sitemap.xml for your website in one click.', points: ['Visits your pages like a search bot', 'Follows robots.txt and noindex', 'Download, copy or submit to Google'], tone: 'white' },
  { href: '/free-tools/youtube-transcript-to-slides', badge: 'Free', name: 'YouTube Transcript to Slides', text: 'Paste a video transcript, clean it up and make slides.', points: ['Keeps time stamps, removes repeats and [Music]', 'Copy, download or open it in the editor', 'Works with .srt and .vtt caption files'], tone: 'white' },
  { href: '/free-tools/video-to-slides', badge: 'AI · Free', name: 'Audio & Video to Slides', text: 'Upload your own recording and get a transcript and a deck.', points: ['Lectures, meetings and voice notes', 'Written in the language that is spoken', 'Turn the transcript into a designed deck'], tone: 'white' },
  { href: '/free-tools/script-to-slides', badge: 'AI · Free', name: 'Video & Reel Script to Slides', text: 'Paste a script and get a slide-by-slide outline.', points: ['Reels, YouTube videos, talks and podcasts', 'Follows your beats, keeps your facts', 'Open it as a designed, editable deck'], tone: 'white' },
]

/** the tools alone (not the templates card) */
export const FREE_TOOLS = TOOL_CARDS.filter((t) => t.href.startsWith('/free-tools/'))
