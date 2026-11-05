import { ArrowRight, FileSearch, FileText, LayoutTemplate, ListChecks } from '@prompttoppt/ui/icons'
import { SectionHeader } from './ui'

/**
 * One worked example, side by side: a dense report excerpt (the figures the AI will use are marked) and the slide made from exactly those figures.
 * It is an illustration with sample numbers, labelled as an example; every number on the slide can be found on the left. No timings or counts are
 * promised here: how long a deck takes depends on its length and the plan.
 */
// solid theme colours only: opacity shortcuts such as bg-primary/70 produce no CSS for this project's variable-based theme colours
const MARK = 'rounded bg-highlight px-0.5 font-semibold text-foreground'
const TABLE: [string, string, string][] = [
  ['Net revenue retention', '128%', '142%'],
  ['Logo churn', '2.8%', '2.1%'],
  ['Enterprise ARR', '$3.1M', '$4.2M'],
]
const STEPS: [typeof FileSearch, string, string][] = [
  [FileSearch, 'Reads everything', 'Every page, table and number in your file or web page.'],
  [ListChecks, 'Picks what matters', 'The key figures and points, not the filler.'],
  [LayoutTemplate, 'Designs the slide', 'A clear, editable slide, with the chart built from your own numbers.'],
]
const EYEBROW = 'font-heading text-xs font-extrabold uppercase tracking-[0.6px]'

export function LiveSimulatorSection() {
  return (
    <div className="bg-gradient-to-b from-[#f0f4f8] to-white pt-14 md:pt-24 pb-16 md:pb-24 px-4 sm:px-6 text-center z-10 relative">
      <div className="max-w-[1150px] mx-auto">
        <SectionHeader
          title="From a Dense Document to One Clear Slide"
          subtitle="Drop in a report, a spreadsheet or a web page. The AI reads it, picks out the numbers and points that matter, and designs the slide for you."
        />

        <figure aria-label="Example: a dense report becomes a clear slide" className="mt-10 md:mt-14 bg-white rounded-[32px] p-5 md:p-12 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border border-border text-left relative">
          <div className="flex flex-col md:flex-row gap-10 md:gap-24 items-stretch relative">
            {/* Before: the source, with the figures the slide will use marked */}
            <div className="flex-1 min-w-0 bg-white border-2 border-dashed border-border-strong rounded-3xl p-4 sm:p-7 flex flex-col gap-4">
              <p className={`${EYEBROW} text-slate-500`}>Before · your document</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-slate-100 px-3 py-2 font-heading text-xs font-bold text-slate-600">
                <FileText aria-hidden size={14} className="shrink-0 text-red-500" />
                <span className="min-w-0 truncate">Q3_board_report.pdf</span>
                <span className="ml-auto shrink-0 font-sans font-medium text-slate-600">example</span>
              </div>
              <p className="font-sans text-[13px] leading-6 text-slate-600 [overflow-wrap:anywhere]">
                …the quarter closed strongly. Net revenue retention reached <mark className={MARK}>142%</mark> in the enterprise cohort, up from <mark className={MARK}>128%</mark> in Q2, while logo churn fell to <mark className={MARK}>2.1%</mark>. Expansion came mainly from seat growth at accounts with more than 500 employees (table 7). The hiring plan adds 14 roles, mostly in sales and support…
              </p>
              <div className="mt-auto overflow-hidden rounded-md border border-border font-sans text-xs text-slate-600" role="table" aria-label="Table 7 from the report">
                <div role="row" className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-x-2 bg-slate-100 px-3 py-1.5 font-heading font-bold text-slate-600">
                  <span role="columnheader">Table 7</span><span role="columnheader" className="text-right">Q2</span><span role="columnheader" className="text-right">Q3</span>
                </div>
                {TABLE.map(([name, q2, q3]) => (
                  <div key={name} role="row" className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-x-2 border-t border-border px-3 py-1.5 tabular-nums">
                    <span role="cell" className="min-w-0 truncate">{name}</span><span role="cell" className="text-right">{q2}</span><span role="cell" className="text-right font-semibold text-foreground">{q3}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* the step between */}
            <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 flex flex-col items-center -my-4 md:my-0">
              <div className="bg-highlight border-2 border-foreground w-12 h-12 rounded-full flex items-center justify-center shadow-[2px_2px_0px_0px_var(--color-text-primary)] z-10 text-foreground">
                <ArrowRight aria-hidden size={22} className="rotate-90 md:rotate-0" />
              </div>
              <div className="bg-white border border-border rounded-xl md:rounded-full py-1 px-3 md:px-2 text-[11px] font-bold text-slate-600 mt-2 shadow-sm whitespace-nowrap md:whitespace-normal md:max-w-[5.5rem] text-center leading-tight relative z-10">
                AI builds the slide
              </div>
            </div>

            {/* After: the slide, every number taken from the left */}
            <div className="flex-1 min-w-0 bg-foreground text-white rounded-3xl p-5 sm:p-7 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <p className={`${EYEBROW} text-secondary`}>After · your slide</p>
                <span className="text-xs font-bold text-slate-400">Slide 4 · Traction</span>
              </div>
              <div className="flex-1 rounded-xl border border-slate-700 bg-[#1e2330] p-4 sm:p-5 flex flex-col gap-4 shadow-inner">
                <div>
                  <h3 className="font-heading font-bold text-xl sm:text-2xl leading-tight text-white">Retention hit 142% in Q3</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-300">Up from 128% in Q2, driven by seat growth at larger accounts.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-xs font-bold text-slate-300">Net revenue retention</p>
                    <div className="mt-3 flex h-[124px] items-end gap-3" role="img" aria-label="Bar chart: 128% in Q2, 142% in Q3">
                      {[['Q2', '128%', 'h-[70px] bg-slate-500'], ['Q3', '142%', 'h-[78px] bg-highlight']].map(([q, v, bar]) => (
                        <div key={q} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <span className="text-xs font-bold text-white">{v}</span>
                          <div className={`w-full rounded-t-md ${bar}`} />
                          <span className="text-xs font-bold text-slate-400">{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {[['Logo churn', '2.1%', 'from 2.8% in Q2'], ['Enterprise ARR', '$4.2M', 'from $3.1M in Q2']].map(([label, value, note]) => (
                      <div key={label} className="flex-1 rounded-lg bg-white/5 p-3">
                        <p className="text-xs font-bold text-slate-300">{label}</p>
                        <p className="mt-1 font-heading text-xl font-extrabold leading-none text-secondary">{value}</p>
                        <p className="mt-1.5 text-xs text-slate-400">{note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400">Source: Q3_board_report.pdf, table 7</p>
            </div>
          </div>

          <ul className="mt-8 md:mt-10 pt-8 border-t border-border grid gap-5 sm:grid-cols-3">
            {STEPS.map(([Icon, title, body]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-foreground bg-secondary text-foreground shadow-[2px_3px_0_0_#181b25]"><Icon aria-hidden size={18} /></span>
                <div>
                  <p className="font-heading text-sm font-extrabold text-foreground">{title}</p>
                  <p className="mt-0.5 text-sm leading-5 text-[#475569]">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </div>
  )
}
