import { demoSlides as themeDemoSlides } from '@prompttoppt/theme/morph-templates'

/** A large PNG goes through Next's image optimiser (a WebP at the size a preview needs); SVGs are already small. */
// the big PNG cut-outs go through the image optimizer (it takes no query string); the WebP files are already small and keep their version number, so a regenerated picture is fetched again
const optimised = (src: string) => { const m = src.match(/^(\/morph-templates\/.+\.(?:png|jpe?g))(?:\?v=\d+)?$/i); return m ? `/_next/image?url=${encodeURIComponent(m[1]!)}&w=1080&q=75` : src }

/** The slides of a template's live preview on the website, pictures served from this site. */
export function previewSlides(templateId: string) {
  const d = themeDemoSlides(templateId, '')
  return { ...d, slides: d.slides.map((s) => ({ ...s, elements: s.elements.map((e) => (e.type === 'image' && e.src ? { ...e, src: optimised(e.src) } : e)) })) }
}
