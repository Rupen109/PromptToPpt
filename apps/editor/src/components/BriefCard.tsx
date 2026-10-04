import type { PromptAnalysis } from '@prompttoppt/validation'

const FAMILY: Record<string, string> = { pitch: 'Pitch & investors', sales: 'Sales & proposals', marketing: 'Marketing', strategy: 'Strategy & planning', product: 'Product', tech: 'Tech & engineering', reports: 'Reports & reviews', education: 'Education & training', 'case-studies': 'Case studies', team: 'Team & onboarding' }

/** "Here's what I understood" — shown before anything is generated, so a misunderstanding costs nothing. */
export function BriefCard({ analysis, keepDesign }: { analysis: PromptAnalysis; keepDesign?: boolean }) {
  const rows: [string, string | undefined][] = [
    ['About', analysis.topic], ['For', analysis.audience], ['Goal', analysis.objective], ['Tone', analysis.tone], ['Style of deck', analysis.category ? FAMILY[analysis.category] : undefined], ['Language', analysis.language?.toUpperCase()],
  ]
  const facts = analysis.facts ?? []
  return (
    <section aria-label="What I understood" className="rounded-xl border border-border bg-slate-50 p-4 text-sm">
      <h3 className="font-semibold mb-2">Here’s what I understood</h3>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
        {rows.filter(([, v]) => v).map(([k, v]) => (<div key={k} className="contents"><dt className="text-slate-600">{k}</dt><dd className="font-medium break-words">{v}</dd></div>))}
      </dl>
      {facts.length > 0 && (
        <div className="mt-3">
          <div className="text-slate-600 mb-1">Your details I’ll use ({facts.length})</div>
          <ul className="list-disc pl-5 space-y-0.5">{facts.slice(0, 8).map((f) => <li key={f}>{f}</li>)}{facts.length > 8 && <li className="text-slate-600">…and {facts.length - 8} more</li>}</ul>
        </div>
      )}
      {analysis.requiredSections.length > 0 && <p className="mt-3 text-slate-700"><span className="text-slate-600">Must cover: </span>{analysis.requiredSections.join(' · ')}</p>}
      {keepDesign && <p className="mt-3 text-green-800">✓ Your design stays exactly as it is — colours, fonts and layout.</p>}
      <p className="mt-3 text-xs text-slate-600">I won’t invent numbers, names or results you didn’t give me.</p>
    </section>
  )
}
