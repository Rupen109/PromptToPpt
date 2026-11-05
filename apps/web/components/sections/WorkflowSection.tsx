import { Star } from '@prompttoppt/ui/icons'
import { CardCarousel } from '@/components/ui/Carousel'
import { Card, type CardTone } from '@/components/ui/Card'
import { Section, SectionHeader, Tile } from './ui'

const STEPS: { n: string; title: string; tone: CardTone; tile: 'yellow' | 'accent' | 'primary'; body: string; chip: string }[] = [
  {
    n: '01', title: 'Feed Any Raw Source', tone: 'cream', tile: 'yellow',
    body: 'Drop in a PDF, a PowerPoint, your notes or a web link — or simply type your vision. The AI reads your sources and pulls out the points that matter.',
    chip: 'Accepts PDF, Word, Excel, PowerPoint, email, text files & web links',
  },
  {
    n: '02', title: 'AI Builds High-Impact Story', tone: 'peach', tile: 'accent',
    body: 'In well under a minute, the AI maps your storyline, turns your data into charts and tables, and writes every slide in one consistent design.',
    chip: 'Charts & tables built from your own data',
  },
  {
    n: '03', title: 'Edit, Present & Export', tone: 'lavender', tile: 'primary',
    body: 'Tweak any slide in the live editor, ask the AI assistant to restyle or animate the whole deck, present full-screen — and export on paid plans.',
    chip: 'Live editor, present mode & export (Pro)',
  },
]

export default function WorkflowSection() {
  return (
    <Section id="workflow">
      <SectionHeader
        title="From Chaos to Pitch Deck in 3 Steps"
        subtitle="Never open a blank PowerPoint slide again. Let intelligent agents orchestrate the storyline, structure data, and render a designed deck."
        max="max-w-[672px]"
      />
      {/* Narrow screens: carousel. From lg: three columns sharing four rows (number, title, text, note) through subgrid, so the notes are the same height and
          sit on one line however long the text is (the site can be translated, so fixed heights would break). */}
      <CardCarousel from="lg" label="How SlidesDone works, in three steps" className="mt-6 lg:mt-16" gridClassName="lg:grid lg:grid-cols-3 lg:gap-x-8 lg:gap-y-0 lg:p-0">
        {STEPS.map((s, i) => (
          <Card key={s.n} as="article" tone={s.tone} index={i} className="group/card p-8 flex flex-col h-full lg:grid lg:row-span-4 lg:grid-rows-subgrid" wrapperClassName="h-full lg:row-span-4 lg:grid lg:grid-rows-subgrid">
            <div><Tile tone={s.tile} size={56}><span className="font-heading font-extrabold text-2xl">{s.n}</span></Tile></div>
            <h3 className="mt-5 font-heading font-extrabold text-2xl leading-8 text-foreground">{s.title}</h3>
            <p className="mt-3 mb-6 flex-1 text-base leading-6 text-[#475569]">{s.body}</p>
            <div className="max-lg:min-h-[4.5rem] flex items-center gap-2.5 bg-white border-2 border-foreground rounded-xl px-3.5 py-3 font-heading font-bold text-xs leading-4 text-foreground">
              <Star aria-hidden size={14} fill="currentColor" className="text-accent shrink-0" />{s.chip}
            </div>
          </Card>
        ))}
      </CardCarousel>
    </Section>
  )
}
