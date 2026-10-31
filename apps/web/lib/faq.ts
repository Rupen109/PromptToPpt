import { DESIGNS } from '@prompttoppt/theme'
import type { Faq } from './seo'

/**
 * The questions people (and AI assistants) ask about SlidesDone. Each answer starts with the direct answer, then adds detail, and only states what the product does today.
 * The same list feeds the visible FAQ, the FAQPage structured data and /llms.txt, so the three can never disagree.
 */
export const GENERAL_FAQS: readonly Faq[] = [
  {
    q: 'What is SlidesDone?',
    a: 'SlidesDone is an AI presentation maker. You describe a topic, or add a PDF, Word, Excel, PowerPoint, email, web link, Google Doc or YouTube video, and it builds a designed, editable slide deck in seconds. You can then edit every slide in your browser, ask the AI to change slides, share the deck, and export it on paid plans.',
  },
  {
    q: 'How do I make a presentation with AI?',
    a: 'Type what the presentation is about on the SlidesDone home page, optionally attach files or links as sources, choose the language, and press Create. The AI writes the slides and picks a matching template. Then open the editor to change any text, picture or layout, or use the AI assistant to edit by chat.',
  },
  {
    q: 'Is SlidesDone free?',
    a: 'Yes, you can start for free with monthly credits and no card. Paid plans add export, premium AI models, more credits and longer decks. The pricing page always shows the current plans and limits.',
  },
  {
    q: 'Which files and sources can I turn into a presentation?',
    a: 'PDF (up to 10 MB and 100 pages), Word, Excel and CSV (up to 15 MB each), PowerPoint (up to 15 MB), emails (up to 10 MB), text and Markdown (up to 1 MB), pictures (up to 8 MB), website links, Google Docs, Sheets and Slides links, YouTube links, and audio or video. You can attach several sources to one deck. Scanned, image-only PDFs are not supported yet.',
  },
  {
    q: 'Are the exported presentations really 100% editable in PowerPoint?',
    a: 'Yes. Every slide is built from real text boxes, shapes, charts and tables, not flattened pictures, which is what makes a PowerPoint export editable. Export to PPTX, PDF and images is part of the Pro and Gold plans; check the pricing section for exactly what each plan includes.',
  },
  {
    q: 'Can I build a presentation myself without AI?',
    a: 'Yes. Choose Create from scratch, pick a slide size and a look, and build with the editor toolbar: text, shapes, tables, charts, pictures from your computer or the media library, and backgrounds. It uses no AI credits.',
  },
  {
    q: 'How many templates are there?',
    a: `${DESIGNS.length} designer-made templates for pitch decks, sales, marketing, strategy, education, reports and more, in light and dark. A selection is free and the rest are on paid plans. The AI picks a template that fits your topic, and you can change its colours and fonts in the editor.`,
  },
  {
    q: 'Is my sensitive financial model or confidential pitch IP safe?',
    a: 'Your presentations and uploaded sources are private to your account. To write your slides, the text of your prompt and sources is sent to the AI model provider that generates them. We never put your prompts, files or slide content into analytics tools, and you can delete any presentation or source at any time.',
  },
]

/** Questions about cost, shown on the pricing page. */
export const PRICING_FAQS: readonly Faq[] = [
  {
    q: 'What does SlidesDone cost?',
    a: 'SlidesDone has a free plan and paid Pro and Gold plans, billed monthly or yearly (yearly costs less per month). The current prices are shown on this page.',
  },
  {
    q: 'What are credits?',
    a: 'Credits pay for the AI work: writing slides, editing with AI, making pictures and researching. Each plan includes a monthly amount of credits, and the app shows how many you have left.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Cancel from the billing page whenever you like and you keep your plan until the end of the period you paid for.',
  },
  {
    q: 'Which payment methods can I use?',
    a: 'Payments are handled securely by Razorpay: cards, UPI and net banking. We never see or store your card details.',
  },
]
