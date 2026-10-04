import { Card, type CardTone } from '@/components/ui/Card'
import { Badge, Section, SectionHeader, Tag, Tile } from './ui'

const STEPS: { n: string; tag: string; title: string; tone: CardTone; tile: 'yellow' | 'accent' | 'primary'; tagText: string; body: string; chip: string }[] = [
  {
    n: '01', tag: 'INPUT STAGE', title: 'Feed Any Raw Source', tone: 'cream', tile: 'yellow', tagText: 'text-foreground',
    body: 'Drop in a PDF, a PowerPoint, your notes or a web link — or simply type your vision. The AI reads your sources and pulls out the points that matter.',
    chip: 'Accepts PDF, PowerPoint, text files & web links',
  },
  {
    n: '02', tag: 'AGENT SYNTHESIS', title: 'AI Builds High-Impact Story', tone: 'peach', tile: 'accent', tagText: 'text-[#b02f00]',
    body: 'In well under a minute, the AI maps your storyline, turns your data into charts and tables, and writes every slide in one consistent design.',
    chip: 'Charts & tables built from your own data',
  },
  {
    n: '03', tag: 'DELIVERY', title: 'Edit, Present & Export', tone: 'lavender', tile: 'primary', tagText: 'text-primary',
    body: 'Tweak any slide in the live editor, ask the AI assistant to restyle or animate the whole deck, present full-screen — and export on paid plans.',
    chip: 'Live editor, present mode & export (Pro)',
  },
]

export default function WorkflowSection() {
  return (
    <Section id="workflow">
      <SectionHeader
        badge={<Badge bg="bg-highlight">Instant velocity</Badge>}
        title="From Chaos to Pitch Deck in 3 Steps"
        subtitle="Never open a blank PowerPoint slide again. Let intelligent agents orchestrate the storyline, structure data, and render a designed deck."
        max="max-w-[672px]"
      />
      <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch max-w-[560px] lg:max-w-none mx-auto">
        {STEPS.map((s, i) => (
          <Card key={s.n} as="article" tone={s.tone} index={i} className="group/card p-8 flex flex-col h-full" wrapperClassName="h-full">
            <div className="flex items-center justify-between">
              <Tile tone={s.tile} size={56}><span className="font-heading font-extrabold text-2xl">{s.n}</span></Tile>
              <Tag className={s.tagText}>{s.tag}</Tag>
            </div>
            <h3 className="font-heading font-extrabold text-2xl leading-8 text-foreground pt-3 mt-3 lg:min-h-[5.5rem]">{s.title}</h3>
            <p className="mt-3 mb-6 text-base leading-6 text-[#475569] min-h-24">{s.body}</p>
            <div className="mt-auto pt-0 flex items-center gap-2.5 bg-white border-2 border-foreground rounded-xl px-3.5 py-3 font-heading font-bold text-xs leading-4 text-foreground">
              <span aria-hidden className="text-accent">★</span>{s.chip}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}
