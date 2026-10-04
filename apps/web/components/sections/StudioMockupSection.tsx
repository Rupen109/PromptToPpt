'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge, HARD, Section, SectionHeader } from './ui'

/** Studio theme presets: the mock slide recolours live, like the real editor's theme switch. */
const MODES = {
  cobalt: { label: 'Cobalt Pro', primary: '#0b3dd0', canvas: '#ffffff', text: '#181b25', muted: '#475569', panel: '#f3f4f9', kpi: '#fffbe6', edge: '#181b25' },
  coral: { label: 'Solar Coral', primary: '#ff5722', canvas: '#fff7f3', text: '#181b25', muted: '#475569', panel: '#ffe9e1', kpi: '#ffdf00', edge: '#181b25' },
  stealth: { label: 'Dark Stealth', primary: '#d4f933', canvas: '#0f172a', text: '#f1f5f9', muted: '#a5b4c7', panel: '#1e293b', kpi: '#1e293b', edge: '#334155' },
} as const
type ModeId = keyof typeof MODES

const SORTER = [
  { n: '01. Title Thesis', t: 'Project Zenith', s: 'Series A Overview', bg: '#eef1fe', tc: '#0b3dd0', active: true },
  { n: '02. TAM & Tailwinds', t: '$14B Market Opportunity', s: '38% YoY CAGR', bg: '#fffbe6', tc: '#181b25' },
  { n: '03. Traction Metrics', t: '142% Retention', s: '$8.5M ARR', bg: '#fff2ee', tc: '#b02f00' },
  { n: '04. Use of Capital', t: '$8.5M Allocation', s: 'GTM & Core Model R&D', bg: '#edf0f7', tc: '#0f172a' },
] as const

const TOOLS = [
  ['▦', '#0b3dd0', 'Layout Grid'],
  ['▮', '#ff5722', 'Toggle Chart Style'],
  ['✦', '#059669', 'Rewrite with AI'],
  ['A', '#9333ea', 'Typography'],
] as const

export default function StudioMockupSection() {
  const [mode, setMode] = useState<ModeId>('cobalt')
  const m = MODES[mode]
  const dark = mode === 'stealth'
  return (
    <Section id="studio" bg="bg-[#f3f4f9]">
      <SectionHeader
        size={48}
        badge={<Badge bg="bg-white" dot="#ff5722">Uncompromised granular control</Badge>}
        title="AI Built It, You Perfect It."
        subtitle="Unlike static AI screenshot generators, PromptToPpt gives you a rich in-browser presentation studio with full layer, chart, and theme authority."
      />

      {/* STUDIO CANVAS MOCKUP CONTAINER */}
      <Card shadow="lg" hover={false} wrapperClassName="mt-10 sm:mt-16 h-auto" className="overflow-hidden text-left">
        {/* top app bar */}
        <div className="bg-foreground border-b-2 border-foreground min-h-14 px-5 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 max-w-full">
            <span className="flex gap-1.5 shrink-0" aria-hidden><i className="w-3 h-3 rounded-full bg-[#ef4444]" /><i className="w-3 h-3 rounded-full bg-secondary" /><i className="w-3 h-3 rounded-full bg-highlight" /></span>
            <span className="font-heading font-extrabold text-xs sm:text-sm text-secondary truncate min-w-0">Zenith_AI_Pitch_Deck_v4.pptx</span>
            <span className="hidden sm:inline bg-white/10 text-white font-heading font-bold text-[11px] leading-4 rounded px-2 py-0.5">12 Slides Loaded</span>
          </div>
          <div className="flex items-center gap-3" role="group" aria-label="Theme mode">
            <span className="hidden md:inline font-heading font-bold text-xs text-[#cbd5e1]">Theme Mode:</span>
            {(Object.keys(MODES) as ModeId[]).map((id) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`rounded-lg font-heading text-xs px-[11px] py-1 transition-colors ${mode === id ? 'text-white font-extrabold border border-white' : 'bg-white/10 text-[#e2e8f0] font-bold hover:bg-white/20 border border-transparent'}`} style={mode === id ? { background: id === 'stealth' ? '#334155' : MODES[id].primary } : undefined}>{MODES[id].label}</button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2 font-heading font-bold text-xs text-highlight"><i className="w-2 h-2 rounded-full bg-highlight" />Cloud Synced</span>
            <span className={`inline-flex items-center gap-1.5 bg-secondary text-foreground border border-foreground rounded-lg px-[15px] py-[5px] font-heading font-extrabold text-xs uppercase ${HARD.sm}`}>⬇ Export PPTX</span>
          </div>
        </div>

        {/* toolbar */}
        <div className="bg-[#edf0f7] border-b-2 border-foreground px-5 py-[11px] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TOOLS.map(([icon, c, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 bg-white border border-foreground rounded-lg px-3 py-[6px] font-heading font-bold text-xs text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"><b style={{ color: c }} aria-hidden>{icon}</b>{label}</span>
            ))}
          </div>
          <span className="hidden sm:inline font-heading font-extrabold text-xs text-primary">Slide 03: Unit Economics & Moats</span>
        </div>

        {/* workspace */}
        <div className="flex">
          <aside className="hidden lg:flex flex-col gap-3 w-[300px] shrink-0 bg-[#edf0f7] border-r-2 border-foreground p-4" aria-label="Slide sorter">
            <div className="font-heading font-extrabold text-xs uppercase tracking-[0.6px] text-[#475569] mb-1">Slide sorter (reorderable)</div>
            {SORTER.map((s) => (
              <div key={s.n} className={`bg-white rounded-xl p-3.5 ${HARD.sm} border-2 ${'active' in s ? 'border-primary' : 'border-foreground'}`}>
                <div className={`flex justify-between font-heading font-bold text-[11px] leading-4 mb-1.5 ${'active' in s ? 'text-primary' : 'text-foreground'}`}><span>{s.n}</span><span aria-hidden>›</span></div>
                <div className="rounded border px-3 py-3.5 text-center" style={{ background: s.bg, borderColor: 'active' in s ? '#0b3dd0' : '#181b25' }}>
                  <div className="font-heading font-extrabold text-xs leading-4" style={{ color: s.tc }}>{s.t}</div>
                  <div className="text-[9px] leading-[14px] text-[#475569]">{s.s}</div>
                </div>
              </div>
            ))}
          </aside>

          <div className="flex-1 min-w-0 bg-[#f3f4f9] p-4 md:p-8 flex flex-col items-center gap-6">
            {/* the 16:9 slide canvas */}
            <div className="w-full max-w-[836px] rounded-2xl border-2 p-4 md:p-[34px] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ background: m.canvas, borderColor: m.edge, color: m.text }}>
              <div className="flex flex-col md:flex-row md:justify-between gap-4">
                <div className="md:max-w-[530px]">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-heading font-extrabold text-xs uppercase text-white ${HARD.sm}`} style={{ background: dark ? '#ff5722' : '#ff5722' }}>📈 Section 03 • Cohort Retention</span>
                  <h3 className="font-heading font-extrabold text-2xl md:text-3xl leading-9 mt-1">Accelerating Net Revenue Retention <span className="whitespace-nowrap">(142% NRR)</span></h3>
                  <p className="text-sm leading-5 mt-2" style={{ color: m.muted }}>Growth fueled by automatic enterprise seat expansion and high-margin API consumption tiers</p>
                </div>
                <div className="rounded-xl border p-[13px] md:w-[202px] md:text-right self-start" style={{ background: m.kpi, borderColor: m.edge }}>
                  <div className="font-heading font-extrabold text-4xl leading-10" style={{ color: m.primary }}>$8.5M</div>
                  <div className="font-heading font-bold text-xs leading-4 uppercase mt-2.5" style={{ color: m.muted }}>Current ARR (Q3 run-rate)</div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border p-[17px]" style={{ background: m.panel, borderColor: m.edge }}>
                  <div className="font-heading font-extrabold text-xs uppercase leading-4" style={{ color: m.muted }}>ARR bridge (quarterly)</div>
                  <div className="mt-3.5 h-24 flex items-end gap-2">
                    {[['Q1', 31, 0.2], ['Q2', 48, 0.4], ['Q3', 66, 0.7], ['Q4', 88, 1]].map(([q, h, a]) => (
                      <div key={q as string} className="flex-1 rounded-t grid place-items-center font-sans font-bold text-[10px]" style={{ height: h as number, background: m.primary, opacity: 0.35 + (a as number) * 0.65, color: (a as number) >= 0.7 && !dark ? '#fff' : dark ? '#0f172a' : '#0f172a' }}>{q}</div>
                    ))}
                  </div>
                  <div className="mt-2 text-right font-sans font-bold text-[11px]" style={{ color: m.primary }}>+105% YoY Growth</div>
                </div>
                <div className="rounded-xl border p-[17px]" style={{ background: m.panel, borderColor: m.edge }}>
                  <div className="font-heading font-extrabold text-xs uppercase leading-4 text-center" style={{ color: m.muted }}>Enterprise logo penetration</div>
                  <div className="mt-3.5 h-24 grid place-items-center">
                    <div className="relative w-20 h-20">
                      <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90" aria-hidden><circle cx="40" cy="40" r="35.5" fill="none" stroke={dark ? '#334155' : '#e2e8f0'} strokeWidth="8.9" /><circle cx="40" cy="40" r="35.5" fill="none" stroke="#ff5722" strokeWidth="8.9" strokeDasharray={`${0.78 * 223} 223`} /></svg>
                      <span className="absolute inset-0 grid place-items-center font-heading font-extrabold text-sm">78%</span>
                    </div>
                  </div>
                  <div className="mt-2 text-center font-sans font-bold text-[11px]" style={{ color: m.muted }}>42 Fortune 500 Pilots</div>
                </div>
                <div className="rounded-xl border p-[17px]" style={{ background: m.panel, borderColor: m.edge }}>
                  <div className="font-heading font-extrabold text-xs uppercase leading-4" style={{ color: m.muted }}>Capital efficiency</div>
                  <div className="mt-4 h-[74px]">
                    <div className="font-heading font-extrabold text-2xl leading-8">11 Months</div>
                    <div className="text-xs leading-4" style={{ color: m.muted }}>Gross margin adjusted CAC payback</div>
                  </div>
                  <span className="mt-1 inline-block bg-highlight text-foreground border border-foreground rounded px-2 py-[2px] font-heading font-extrabold text-[10px] leading-[15px] uppercase">★ Top decile performance</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex flex-wrap justify-between gap-2 font-sans font-bold text-xs leading-4" style={{ borderColor: dark ? '#334155' : '#e2e8f0', color: m.muted }}>
                <span>Project Zenith • Confidential Investor Series A Deck</span>
                <span>PromptToPpt Precision Canvas</span>
              </div>
            </div>

            {/* bottom floating AI copilot prompt bar */}
            <div className={`w-full max-w-[836px] bg-white border-2 border-foreground rounded-2xl p-3 flex items-center gap-3 ${HARD.sm}`}>
              <span className="w-8 h-8 rounded-xl grid place-items-center text-white shrink-0 transition-colors" style={{ background: dark ? '#334155' : m.primary }} aria-hidden>✦</span>
              <p className="flex-1 min-w-0 truncate font-sans font-semibold text-sm leading-5 text-foreground">Adjust Q4 projected ARR to $10.2M and highlight Fortune 100 customer retention rate</p>
              <span className={`hidden sm:inline-block rounded-xl border-2 border-foreground px-[22px] py-2 font-heading font-extrabold text-xs uppercase tracking-[0.6px] text-white ${HARD.sm} transition-colors`} style={{ background: dark ? '#334155' : m.primary }}>Apply Edit</span>
            </div>
          </div>
        </div>
      </Card>
    </Section>
  )
}
