import React from 'react';

export default function WorkflowSection() {
  return (
    <section className="py-24 px-6 bg-white text-center">
      <div className="mb-16 flex flex-col items-center">
        <div className="bg-highlight text-foreground inline-block py-1 px-3 font-heading font-extrabold text-[11px] rounded-full border border-foreground mb-4 shadow-[2px_2px_0px_0px_#181b25]">
          INSTANT VELOCITY
        </div>
        <h2 className="text-4xl mb-4 leading-[1.1] font-heading font-extrabold">
          From Chaos to Pitch Deck in 3 Steps
        </h2>
        <p className="text-base text-secondary max-w-[600px] mx-auto">
          Never open a blank PowerPoint slide again. Let intelligent agents orchestrate the storyline, structure data, and render vector decks.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1100px] mx-auto">
        {/* Step 1 */}
        <div className="bg-[#fffbe6] border-2 border-foreground rounded-xl p-8 shadow-[8px_8px_0px_0px_#181b25] flex flex-col text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-highlight text-foreground border-2 border-foreground rounded-md w-12 h-12 flex items-center justify-center font-heading text-2xl font-extrabold shadow-[4px_4px_0px_0px_#181b25]">
              01
            </div>
            <div className="bg-white text-foreground border border-foreground rounded-full px-3 py-1 font-heading text-[10px] font-extrabold">
              INPUT STAGE
            </div>
          </div>
          <h3 className="text-2xl font-heading font-extrabold mb-4 leading-[1.1]">Feed Any Raw Source</h3>
          <p className="text-sm text-secondary leading-relaxed mb-8 flex-1">
            Drop investment memos, napkin wireframes, messy spreadsheets, or simply type your vision. Context parsers instantly isolate thesis points.
          </p>
          <div className="bg-white border border-foreground rounded-md py-2 px-4 flex items-center gap-2 text-[10px] font-bold text-foreground">
            <span className="text-[#ff5722]">☑</span> Accepts PDF, Figma, JPG, Notion & XLSX
          </div>
        </div>
        
        {/* Step 2 */}
        <div className="bg-[#fff2ee] border-2 border-foreground rounded-xl p-8 shadow-[8px_8px_0px_0px_#181b25] flex flex-col text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-[#ff5722] text-white border-2 border-foreground rounded-md w-12 h-12 flex items-center justify-center font-heading text-2xl font-extrabold shadow-[4px_4px_0px_0px_#181b25]">
              02
            </div>
            <div className="bg-white text-[#ff5722] border border-foreground rounded-full px-3 py-1 font-heading text-[10px] font-extrabold">
              AGENT SYNTHESIS
            </div>
          </div>
          <h3 className="text-2xl font-heading font-extrabold mb-4 leading-[1.1]">AI Builds High-Impact Story</h3>
          <p className="text-sm text-secondary leading-relaxed mb-8 flex-1">
            In 30 seconds, dual AI engines map narrative density, construct charts from tables, and write punchy executive bullet points.
          </p>
          <div className="bg-white border border-foreground rounded-md py-2 px-4 flex items-center gap-2 text-[10px] font-bold text-foreground">
            <span className="text-[#ff5722]">☑</span> Auto-calculates TAM, Moat & Financials
          </div>
        </div>
        
        {/* Step 3 */}
        <div className="bg-[#f5f3ff] border-2 border-foreground rounded-xl p-8 shadow-[8px_8px_0px_0px_#181b25] flex flex-col text-left">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-[#0b3dd0] text-white border-2 border-foreground rounded-md w-12 h-12 flex items-center justify-center font-heading text-2xl font-extrabold shadow-[4px_4px_0px_0px_#181b25]">
              03
            </div>
            <div className="bg-white text-[#0b3dd0] border border-foreground rounded-full px-3 py-1 font-heading text-[10px] font-extrabold">
              DELIVERY
            </div>
          </div>
          <h3 className="text-2xl font-heading font-extrabold mb-4 leading-[1.1]">Export Native .PPTX</h3>
          <p className="text-sm text-secondary leading-relaxed mb-8 flex-1">
            Tweak slides in our live canvas or export directly to Microsoft PowerPoint, Keynote, or Google Slides. 100% vector and typography editable.
          </p>
          <div className="bg-white border border-foreground rounded-md py-2 px-4 flex items-center gap-2 text-[10px] font-bold text-foreground">
            <span className="text-[#ff5722]">☑</span> 100% Vector Shapes & Native Fonts
          </div>
        </div>
      </div>
    </section>
  );
}
