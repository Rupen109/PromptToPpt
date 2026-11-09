import type { MorphTemplate } from '@prompttoppt/theme/morph-templates'
import { previewSlides } from '@/lib/morph-demos'
import { MorphPreview } from '@/components/morph/MorphPreview'

/** The live previews of some Morph templates, each with what it is best for and its scenes. Server side: the scenes arrive in the page already composed. */
export function TemplateShowcase({ templates, headingLevel = 3 }: { templates: readonly MorphTemplate[]; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3'
  return (
    <div className="flex flex-col gap-16">
      {templates.map((tpl) => {
        const { slides, theme, titles } = previewSlides(tpl.id)
        return (
          <article key={tpl.id} id={tpl.id} aria-labelledby={`${tpl.id}-h`} className="grid gap-6 lg:grid-cols-[1.45fr_1fr] items-start scroll-mt-24">
            <MorphPreview name={`${tpl.name} template`} slides={slides} theme={theme} titles={titles} />
            <div>
              <H id={`${tpl.id}-h`} className="font-heading font-extrabold text-2xl text-foreground">{tpl.name} Morph template</H>
              <p className="mt-1 font-semibold text-primary">{tpl.tagline}</p>
              <p className="mt-3 text-[#475569] leading-6">{tpl.description}</p>
              <h4 className="mt-5 font-heading font-extrabold text-sm uppercase tracking-wide text-foreground">Best for</h4>
              <ul className="mt-2 flex flex-wrap gap-2">{tpl.topics.slice(0, 10).map((t) => <li key={t} className="rounded-full border-2 border-foreground bg-white px-3 py-1 text-sm font-semibold capitalize">{t}</li>)}</ul>
              <h4 className="mt-5 font-heading font-extrabold text-sm uppercase tracking-wide text-foreground">{tpl.scenes.length} scenes</h4>
              <p className="mt-2 text-sm text-[#475569] leading-6">{[...new Set(tpl.scenes.map((s) => s.title))].join(' · ')}</p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
