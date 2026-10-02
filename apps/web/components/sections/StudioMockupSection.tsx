import React from 'react';

export default function StudioMockupSection() {
  return (
    <section className="bg-[var(--color-bg-secondary)] py-24 px-6 text-center">
      <div className="inline-block bg-white px-3 py-1 font-heading font-extrabold text-xs rounded-full border border-[var(--color-text-primary)] shadow-[2px_2px_0px_0px_var(--color-text-primary)] mb-4">
        <span className="text-[#ef4444] mr-1">●</span> UNCOMPROMISED GRANULAR CONTROL
      </div>
      <h2 className="text-4xl font-extrabold mb-4 mt-4 leading-tight text-[var(--color-text-primary)]">AI Built It, You Perfect It.</h2>
      <p className="text-base text-[var(--color-text-secondary)] max-w-[600px] mx-auto">
        Unlike static AI screenshot generators, PromptToPpt gives you a rich in-browser presentation studio with full layer, chart, and theme authority.
      </p>

      <div className="bg-white border-4 border-[var(--color-text-primary)] rounded-2xl max-w-[1200px] mx-auto mt-12 shadow-xl overflow-hidden flex flex-col">
        {/* Top Bar */}
        <div className="bg-[var(--color-text-primary)] h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
              <div className="w-3 h-3 rounded-full bg-[#facc15]"></div>
              <div className="w-3 h-3 rounded-full bg-[#d4f933]"></div>
            </div>
            <div className="text-[var(--color-warning)] font-heading font-extrabold text-sm flex items-center gap-3">
              Zenith_AI_Pitch_Deck_v4.pptx
              <span className="bg-white/20 text-white px-2 py-1 rounded text-[10px]">12 Slides Loaded</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-gray-400 text-[11px] font-bold">
            <span>Theme Mode:</span>
            <button className="bg-[var(--color-primary)] text-white px-3 py-1 rounded-full text-[11px] font-bold">Cobalt Pro</button>
            <button className="text-gray-400 px-3 py-1 rounded-full text-[11px] font-bold">Solar Coral</button>
            <button className="text-gray-400 px-3 py-1 rounded-full text-[11px] font-bold">Dark Stealth</button>
          </div>
          <div className="flex items-center gap-6 text-[var(--color-highlight)] text-xs font-bold">
            <span><span className="text-[#d4f933] mr-1">●</span> Cloud Synced</span>
            <button className="bg-[var(--color-warning)] text-[var(--color-text-primary)] border-none px-3 py-1.5 rounded text-xs font-bold cursor-pointer">
              📥 EXPORT PPTX
            </button>
          </div>
        </div>
        
        {/* Tool Bar */}
        <div className="bg-white border-b-2 border-[var(--color-border-strong)] h-12 flex items-center justify-between px-4">
          <div className="flex gap-2">
            <button className="bg-white border border-[var(--color-border-strong)] rounded px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <span className="text-[#0b3dd0]">▦</span> Layout Grid
            </button>
            <button className="bg-white border border-[var(--color-border-strong)] rounded px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <span className="text-[#ff5722]">📊</span> Toggle Chart Style
            </button>
            <button className="bg-white border border-[var(--color-border-strong)] rounded px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <span className="text-[#10b981]">✨</span> Rewrite with AI
            </button>
            <button className="bg-white border border-[var(--color-border-strong)] rounded px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <span className="text-[#9333ea]">A</span> Typography
            </button>
          </div>
          <div className="text-[11px] font-bold">
            <span className="text-[#0b3dd0]">Slide 03:</span> <span className="text-slate-600">Unit Economics & Moats</span>
          </div>
        </div>

        <div className="flex flex-1 bg-[var(--color-bg-secondary)] min-h-0">
          {/* Left Sidebar */}
          <div className="w-[280px] bg-[var(--color-bg)] border-r-2 border-[var(--color-border-strong)] p-4 flex flex-col gap-3 text-left">
            <div className="text-[10px] font-bold text-[var(--color-text-secondary)] mb-2">SLIDE SORTER (REORDERABLE)</div>
            
            <div className="bg-white border-2 border-[var(--color-primary)] rounded-md p-3 flex flex-col">
              <div className="flex justify-between text-[10px] font-bold mb-2 text-[var(--color-primary)]">
                <span>01. Title Thesis</span>
                <span>⋮⋮</span>
              </div>
              <div className="bg-[var(--color-highlight-light)] border border-[var(--color-primary)] rounded p-4 pb-2 text-center">
                <div className="text-[11px] font-extrabold mb-0.5 text-[var(--color-primary)]">Project Zenith</div>
                <div className="text-[8px] text-[var(--color-text-secondary)]">Series A Overview</div>
              </div>
            </div>

            <div className="bg-white border-2 border-[var(--color-text-primary)] rounded-md p-3 flex flex-col">
              <div className="flex justify-between text-[10px] font-bold mb-2">
                <span className="text-[#181b25]">02. TAM & Tailwinds</span>
                <span className="text-[#181b25]">⋮⋮</span>
              </div>
              <div className="bg-[#fffbe6] border border-[var(--color-border)] rounded p-4 pb-2 text-center">
                <div className="text-[11px] font-extrabold mb-0.5 text-[#181b25]">$14B Market Opportunity</div>
                <div className="text-[8px] text-[var(--color-text-secondary)]">38% YoY CAGR</div>
              </div>
            </div>

            <div className="bg-white border-2 border-[var(--color-text-primary)] rounded-md p-3 flex flex-col">
              <div className="flex justify-between text-[10px] font-bold mb-2">
                <span className="text-[#181b25]">03. Traction Metrics</span>
                <span className="text-[#181b25]">⋮⋮</span>
              </div>
              <div className="bg-[#fff2ee] border border-[var(--color-border)] rounded p-4 pb-2 text-center">
                <div className="text-[11px] font-extrabold mb-0.5 text-[#b02f00]">142% Retention</div>
                <div className="text-[8px] text-[var(--color-text-secondary)]">$8.5M ARR</div>
              </div>
            </div>

            <div className="bg-white border-2 border-[var(--color-text-primary)] rounded-md p-3 flex flex-col">
              <div className="flex justify-between text-[10px] font-bold mb-2">
                <span className="text-[#181b25]">04. Use of Capital</span>
                <span className="text-[#181b25]">⋮⋮</span>
              </div>
              <div className="bg-[#edf0f7] border border-[var(--color-border)] rounded p-4 pb-2 text-center">
                <div className="text-[11px] font-extrabold mb-0.5 text-[#0f172a]">$8.5M Allocation</div>
                <div className="text-[8px] text-[var(--color-text-secondary)]">GTM & Core Model R&D</div>
              </div>
            </div>
          </div>
          
          {/* Center Canvas */}
          <div className="flex-1 p-8 flex flex-col items-center">
            <div className="bg-white w-full max-w-[800px] border-2 border-[var(--color-text-primary)] rounded-xl p-8 flex flex-col text-left shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
              <div className="bg-[var(--color-accent)] text-white inline-flex px-3 py-1 rounded-full text-[11px] font-bold mb-4 self-start">
                📈 SECTION 03 • COHORT RETENTION
              </div>
              <div className="flex justify-between items-start">
                <div className="max-w-[500px]">
                  <h3 className="text-[28px] font-extrabold leading-[1.1] mb-2 text-[var(--color-text-primary)]">
                    Accelerating Net Revenue Retention<br/>(142% NRR)
                  </h3>
                  <p className="text-[var(--color-text-secondary)] text-sm">
                    Growth fueled by automatic enterprise seat expansion and high-margin API consumption tiers. <span className="text-[#ef4444]">●</span>
                  </p>
                </div>
                <div className="border border-[var(--color-border-strong)] rounded-md px-6 py-3 text-center">
                  <h4 className="text-[var(--color-primary)] text-[32px] font-extrabold">$8.5M</h4>
                  <span className="text-[9px] text-[var(--color-text-secondary)] font-bold">CURRENT ARR (Q3 RUN-RATE)</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mt-8">
                <div className="border border-[var(--color-border)] rounded-md p-4 bg-[var(--color-bg)] text-center flex flex-col">
                  <div className="text-[10px] font-bold text-[var(--color-text-secondary)] mb-4">ARR BRIDGE (QUARTERLY)</div>
                  <div className="flex-1 flex items-end justify-center min-h-[80px] gap-1">
                    <div className="w-8 bg-[#cbd5e1] rounded-t flex items-center justify-center text-[#0f172a] text-[10px] font-bold" style={{height: '40px'}}>Q1</div>
                    <div className="w-8 bg-[#94a3b8] rounded-t flex items-center justify-center text-[#0f172a] text-[10px] font-bold" style={{height: '60px'}}>Q2</div>
                    <div className="w-8 bg-[#3b82f6] rounded-t flex items-center justify-center text-white text-[10px] font-bold" style={{height: '80px'}}>Q3</div>
                    <div className="w-8 bg-[#0b3dd0] rounded-t flex items-center justify-center text-white text-[10px] font-bold" style={{height: '100px'}}>Q4</div>
                  </div>
                  <div className="text-[10px] font-bold mt-4 text-[var(--color-primary)]">+105% YoY Growth</div>
                </div>
                
                <div className="border border-[var(--color-border)] rounded-md p-4 bg-[var(--color-bg)] text-center flex flex-col">
                  <div className="text-[10px] font-bold text-[var(--color-text-secondary)] mb-4">ENTERPRISE LOGO PENETRATION</div>
                  <div className="flex-1 flex items-end justify-center min-h-[80px]">
                    <div className="w-20 h-20 rounded-full border-8 border-[var(--color-accent)] border-l-[var(--color-border-strong)] flex items-center justify-center text-base font-bold text-[var(--color-text-primary)]">
                      78%
                    </div>
                  </div>
                  <div className="text-[10px] font-bold mt-4 text-[#475569]">42 Fortune 500 Pilots</div>
                </div>
                
                <div className="border border-[var(--color-border)] rounded-md p-4 bg-[var(--color-bg)] text-center flex flex-col">
                  <div className="text-[10px] font-bold text-[var(--color-text-secondary)] mb-4">CAPITAL EFFICIENCY</div>
                  <div className="flex-1 flex flex-col items-start justify-center min-h-[80px]">
                    <div className="text-2xl font-extrabold text-[var(--color-text-primary)]">11 Months</div>
                    <div className="text-[10px] text-[#475569]">Gross margin adjusted CAC payback</div>
                    <div className="bg-[#d4f933] px-2 py-0.5 text-[8px] font-extrabold mt-3 border border-[#181b25] text-[#181b25]">
                      ★ TOP DECILE PERFORMANCE
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between border-t border-[var(--color-border)] pt-4 mt-8 text-[10px] font-bold text-[var(--color-text-secondary)]">
                <span>Project Zenith • Confidential Investor Series A Deck</span>
                <span>PromptToPpt Precision Canvas</span>
              </div>
            </div>
            
            <div className="bg-white border-2 border-[var(--color-text-primary)] rounded-full mt-6 p-2 flex items-center w-full max-w-[800px]">
              <div className="bg-[var(--color-primary)] text-white w-9 h-9 rounded-full flex items-center justify-center mr-3 ml-1 text-base">🤖</div>
              <input type="text" className="flex-1 border-none outline-none text-sm font-sans text-[var(--color-text-primary)] bg-transparent" defaultValue="Adjust Q4 projected ARR to $10.2M and highlight Fortune 100 customer retention rate" />
              <button className="bg-[var(--color-primary)] text-white border-none px-5 py-2.5 rounded-full font-bold text-xs cursor-pointer">
                APPLY EDIT
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
