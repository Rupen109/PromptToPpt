import React from 'react';

export function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] py-20 px-6 text-center relative overflow-hidden z-0">
      {/* Blurred blobs */}
      <div className="absolute rounded-full blur-[100px] -z-10 w-[300px] h-[300px] bg-[rgba(255,223,0,0.4)] -top-[50px] -left-[100px]"></div>
      <div className="absolute rounded-full blur-[100px] -z-10 w-[400px] h-[400px] bg-[rgba(255,87,34,0.3)] top-[100px] -right-[100px]"></div>

      <div className="inline-flex items-center gap-3 bg-white border-2 border-foreground rounded-full py-2 px-5 mb-8 shadow-[3px_3px_0px_0px_var(--color-text-primary)]">
        <span className="font-heading font-extrabold text-sm text-foreground"><span className="text-highlight">O</span> THE AGENCY-GRADE PITCH DECK ENGINE</span>
        <span className="text-foreground text-sm font-bold">•</span>
        <span className="font-heading font-bold text-sm text-slate-600">Over 140,000 Decks Synthesized</span>
      </div>
      
      <h1 className="text-6xl leading-tight mb-6 max-w-[900px] mx-auto font-heading font-extrabold">
        Turn Messy Documents into <br/>
        <span className="bg-secondary px-2 rounded-sm inline-block -rotate-2 shadow-solid border-2 border-foreground">Boardroom-Ready</span><br/>
        Presentations in 45 Seconds.
      </h1>
      
      <p className="text-xl max-w-[700px] mx-auto mb-12 text-slate-600">
        Stop agonizing over PowerPoint formatting. Type a prompt, drop a PDF, or snap a whiteboard photo. Our dual-agent AI builds high-conviction slides instantly.
      </p>

      {/* Dynamic Prompt Builder */}
      <div className="relative max-w-[900px] mx-auto">
        <div className="absolute -top-[15px] left-0 right-0 flex justify-between px-12 z-10 pointer-events-none">
          <div className="bg-highlight text-foreground font-heading font-extrabold text-xs py-1 px-3 rounded-full border-2 border-foreground shadow-[2px_2px_0px_0px_var(--color-text-primary)] -rotate-3">⚙️ ZERO FLUFF ENGINE</div>
          <div className="bg-accent text-white font-heading font-extrabold text-xs py-1 px-3 rounded-full border-2 border-foreground shadow-[2px_2px_0px_0px_var(--color-text-primary)] rotate-3">⏱ 45S RENDER</div>
        </div>
        
        <div className="bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] text-left overflow-hidden">
          <div className="flex gap-2 p-4 px-6 bg-slate-50 border-b border-border">
            <div className="py-2 px-4 font-heading font-bold text-xs text-white bg-primary rounded-full flex items-center gap-2">
              <span className="mr-1">✨</span> PROMPT TO DECK
            </div>
            <div className="py-2 px-4 font-heading font-bold text-xs text-slate-500 bg-slate-100 rounded-full flex items-center gap-2">📄 PDF & FINANCIAL MODEL</div>
            <div className="py-2 px-4 font-heading font-bold text-xs text-slate-500 bg-slate-100 rounded-full flex items-center gap-2">📷 NAPKIN / WIREFRAME</div>
            <div className="py-2 px-4 font-heading font-bold text-xs text-slate-500 bg-slate-100 rounded-full flex items-center gap-2">🔗 LIVE WEB SCRAPE</div>
          </div>
          
          <div className="p-6 bg-slate-50">
            <div className="border border-foreground rounded-lg p-4 mb-6 bg-white shadow-sm">
              <label className="font-heading text-xs font-extrabold text-slate-500 mb-2 block">
                <span className="text-primary mr-1">⚙️</span> CONVERSATIONAL SYNTHESIS PROMPT
              </label>
              <textarea 
                className="w-full text-base py-2 border-none bg-transparent mb-4 font-sans resize-none h-[80px] text-foreground focus:outline-none" 
                defaultValue="Series A pitch deck for B2B AI Operations raising $8.5M. Include 142% net dollar retention, enterprise customer quotes, TAM breakdown ($14B), and competitive moat wedge against legacy incumbent tools."
              />
              <div className="flex items-center gap-3 mt-6 flex-wrap">
                <span className="inline-flex items-center gap-2 bg-white border border-border py-2 px-4 rounded-full font-heading font-bold text-xs text-foreground shadow-[1px_1px_0px_0px_var(--color-border)]">
                  <span className="w-2.5 h-2.5 rounded-full inline-block border border-foreground bg-highlight"></span>
                  12 Slides (Recommended)
                </span>
                <span className="inline-flex items-center gap-2 bg-white border border-border py-2 px-4 rounded-full font-heading font-bold text-xs text-foreground shadow-[1px_1px_0px_0px_var(--color-border)]">
                  <span className="w-2.5 h-2.5 rounded-full inline-block border border-foreground bg-primary"></span>
                  Vibe: Bold Minimal Cobalt
                </span>
                <span className="inline-flex items-center gap-2 bg-white border border-border py-2 px-4 rounded-full font-heading font-bold text-xs text-foreground shadow-[1px_1px_0px_0px_var(--color-border)]">
                  <span className="w-2.5 h-2.5 rounded-full inline-block border border-foreground bg-accent"></span>
                  Tone: Institutional VC
                </span>
                <span className="font-handwriting text-lg font-bold text-primary ml-2">Click chip to load blueprint ➔</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-dashed border-border-strong">
              <div className="flex items-center gap-3">
                <span className="font-heading text-xs font-extrabold text-slate-500">OR DROP SOURCE FILES:</span>
                <span className="py-1 px-3 rounded-sm font-heading font-extrabold text-xs border border-transparent bg-red-100 text-red-700">.PDF</span>
                <span className="py-1 px-3 rounded-sm font-heading font-extrabold text-xs border border-transparent bg-blue-100 text-blue-700">.PNG</span>
                <span className="py-1 px-3 rounded-sm font-heading font-extrabold text-xs border border-transparent bg-purple-100 text-purple-700">.FIGMA</span>
                <span className="py-1 px-3 rounded-sm font-heading font-extrabold text-xs border border-transparent bg-green-100 text-green-700">.XLSX</span>
              </div>
              <button className="bg-foreground text-highlight font-heading font-extrabold text-sm py-3 px-6 rounded-md shadow-solid hover:-translate-y-0.5 transition-transform">
                Generate 12 PPTX Slides 🚀
              </button>
            </div>
            
            <div className="mt-8 flex gap-3 items-center">
              <span className="font-heading text-xs font-extrabold text-slate-500">QUICK TEMPLATES:</span>
              <span className="bg-slate-200 text-foreground py-1 px-3 rounded-full font-heading font-bold text-xs cursor-pointer hover:bg-slate-300">🚀 $8.5M Series A Pitch</span>
              <span className="bg-slate-200 text-foreground py-1 px-3 rounded-full font-heading font-bold text-xs cursor-pointer hover:bg-slate-300">📊 Q3 Board Governance</span>
              <span className="bg-slate-200 text-foreground py-1 px-3 rounded-full font-heading font-bold text-xs cursor-pointer hover:bg-slate-300">🛠 GTM Product Launch</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
