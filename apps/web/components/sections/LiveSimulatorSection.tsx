import { Zap, RefreshCw, ArrowRight, Check } from '@prompttoppt/ui/icons'
import React from 'react';

export function LiveSimulatorSection() {
  return (
    <div className="bg-gradient-to-b from-[#f0f4f8] to-white pt-14 md:pt-24 pb-16 md:pb-24 px-4 sm:px-6 text-center z-10 relative">
      <div className="max-w-[1150px] mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center bg-white border border-foreground font-heading font-extrabold text-xs py-1 px-3 rounded-full text-slate-500 shadow-sm">
            <Zap aria-hidden size={14} className="text-accent mr-2" />
            LIVE INGESTION SIMULATOR
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-extrabold mt-4 text-foreground">See Raw Chaos Transform into High-Conviction Slides</h2>
        </div>

        <div className="bg-white rounded-[32px] p-5 md:p-12 shadow-[0_20px_40px_rgba(0,0,0,0.05)] border border-border text-left relative">
          <div className="flex flex-col md:flex-row gap-10 md:gap-20 items-stretch md:items-center relative">
            
            {/* Left: Raw Messy Source Input Mockup */}
            <div className="flex-1 min-w-0 bg-white border-2 border-dashed border-border-strong rounded-3xl p-4 sm:p-8 md:min-h-[340px] flex flex-col gap-6">
              <div className="bg-slate-100 border border-border p-4 rounded-md font-heading text-xs font-bold flex flex-wrap justify-between items-start gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="inline-block w-3 h-3 shrink-0 bg-red-500 rounded-full mt-0.5"></span>
                  <span className="text-slate-600 leading-tight break-words [overflow-wrap:anywhere]">INPUT:<br/>CONFIDENTIAL_MODEL_V3.PDF</span>
                </div>
                <span className="shrink-0 ml-2 text-[11px] bg-red-100 text-red-700 py-1.5 px-2.5 rounded text-left leading-tight">
                  42 Pages<br/>Unstructured
                </span>
              </div>
              
              <div className="flex flex-col gap-4 my-2">
                <div className="h-3 bg-slate-200 rounded w-full"></div>
                <div className="h-3 bg-slate-200 rounded w-full"></div>
                
                {/* Colorful OCR Highlights row */}
                <div className="flex gap-3 mt-2">
                  <div className="flex-1 border-l-2 border-primary pl-3 flex flex-col gap-2">
                    <div className="h-2 rounded w-full bg-primary/30"></div>
                    <div className="h-2 rounded w-4/5 bg-slate-200"></div>
                  </div>
                  <div className="flex-1 border-l-2 border-accent pl-3 flex flex-col gap-2">
                    <div className="h-2 rounded w-full bg-accent/30"></div>
                    <div className="h-2 rounded w-4/5 bg-slate-200"></div>
                  </div>
                  <div className="flex-1 border-l-2 border-highlight pl-3 flex flex-col gap-2">
                    <div className="h-2 rounded w-full bg-highlight"></div>
                    <div className="h-2 rounded w-4/5 bg-slate-200"></div>
                  </div>
                </div>
                
                <div className="h-3 bg-slate-200 rounded w-full mt-2"></div>
              </div>
              
              <div className="mt-auto flex justify-between items-center font-heading text-xs font-bold border-t border-border pt-4">
                <span className="text-slate-600">OCR Table Extraction: Active</span>
                <span className="flex items-center gap-1 text-primary">
                  <RefreshCw aria-hidden size={14} /> Parsing 24 Tables
                </span>
              </div>
            </div>

            {/* Center Arrow */}
            <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 flex flex-col items-center -my-4 md:my-0 rotate-90 md:rotate-0">
              <div className="bg-highlight border-2 border-foreground w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl shadow-[2px_2px_0px_0px_var(--color-text-primary)] z-10 text-foreground">
                <ArrowRight aria-hidden size={22} />
              </div>
              <div className="bg-white border border-border rounded-full py-1 px-3 text-[10px] font-bold text-slate-500 mt-2 shadow-sm whitespace-nowrap relative z-10 -rotate-90 md:rotate-0">
                Synthesized in 28s
              </div>
            </div>

            {/* Right: Rendered Presentation Slide */}
            <div className="flex-1 min-w-0 bg-foreground text-white rounded-3xl p-8 min-h-[340px] flex flex-col shadow-2xl">
              <div className="flex justify-between items-start border-b border-slate-700 pb-4 mb-6">
                <span className="bg-primary/20 text-indigo-200 py-1 px-2 rounded text-[10px] font-extrabold leading-tight">
                  SLIDE 04:<br/>TRACTION
                </span>
                <span className="text-slate-300 text-xs font-bold">
                  Project_Zenith.pptx <Check aria-hidden size={14} className="inline text-secondary" />
                </span>
                <span className="text-secondary text-xs font-bold text-right leading-tight">
                  100% Vector<br/>PPTX
                </span>
              </div>
              
              <div className="flex-1 bg-[#1e2330] rounded-xl border border-slate-700 p-6 flex flex-col justify-between shadow-inner">
                <div>
                  <h3 className="font-heading font-bold text-2xl text-white mb-2 leading-tight">142% Net Dollar Retention</h3>
                  <p className="text-slate-400 text-xs max-w-[80%]">Driven by expansion in top quartile enterprise accounts.</p>
                </div>
                
                <div className="flex items-end gap-2 h-[80px] mt-6">
                  <div className="flex-1 bg-primary/40 h-[40%] rounded-t-sm border-t border-primary relative"><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">Q1</span></div>
                  <div className="flex-1 bg-primary/60 h-[60%] rounded-t-sm border-t border-primary relative"><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">Q2</span></div>
                  <div className="flex-1 bg-primary/80 h-[80%] rounded-t-sm border-t border-primary relative"><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">Q3</span></div>
                  <div className="flex-1 bg-highlight h-[100%] rounded-t-sm border-t border-white relative shadow-[0_0_15px_rgba(212,249,51,0.3)]">
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-extrabold text-white bg-foreground px-1.5 py-0.5 rounded border border-slate-600">Q4</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold">Auto-Generated Chart from pg. 18 of PDF</span>
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                  <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
