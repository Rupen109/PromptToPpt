import React from 'react'

export function ModalitiesSection() {
  return (
    <section className="py-24 px-6 bg-background">
      <div className="flex justify-between items-end mb-12 text-left max-w-[1200px] mx-auto">
        <div className="max-w-[600px]">
          <div className="bg-[#ffdf00] inline-block py-1 px-3 font-heading font-extrabold text-xs rounded-sm border border-foreground shadow-[2px_2px_0px_0px_currentColor] mb-4">
            MULTI-MODAL INGESTION MATRIX
          </div>
          <h2 className="text-4xl mb-4 leading-[1.1] font-heading font-extrabold">Give It Anything. Get Boardroom Slides.</h2>
          <p className="text-base text-secondary">
            We don't limit you to typing prompts into a basic textbox. Ingest messy spreadsheets, 80-page whitepapers, whiteboard drawings, or live company URLs.
          </p>
        </div>
        <div className="pb-4">
          <span className="text-accent font-handwriting text-xl font-bold">↓ Supported file types & live bridges</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-[1200px] mx-auto">
        {/* Card 1 */}
        <div className="bg-[#fffbe6] border border-border-strong rounded-lg p-6 flex flex-col gap-4 shadow-sm text-left">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-md flex items-center justify-center border border-foreground shadow-[2px_2px_0px_0px_currentColor] bg-[#ffdf00]">
              ✨
            </div>
            <div className="bg-background border border-border-strong rounded-full py-1 px-3 font-heading text-[11px] font-extrabold text-foreground">
              MODALITY 01
            </div>
          </div>
          <h3 className="font-heading text-xl font-extrabold leading-[1.2]">Prompt to Complete Deck</h3>
          <p className="text-sm leading-relaxed text-secondary">
            Dual-agent storyline synthesis creates problem-solution arcs, TAM calculations, and competitor moats.
          </p>
          
          <div className="bg-background border border-border rounded-md p-4 flex flex-col gap-2 mt-auto shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading text-[11px] font-bold text-[#0b3dd0]">Prompt Pipeline</span>
              <span className="font-heading text-[11px] font-bold py-0.5 px-1.5 rounded bg-[#d4f933] text-[#181b25]">12 Slides</span>
            </div>
            <div className="bg-gray-100 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>01. Problem & Macro Shift</span>
            </div>
            <div className="bg-gray-100 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>02. Proprietary Solution</span>
            </div>
            <div className="bg-highlight py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>03. $14B Addressable Market</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center border-t border-border-strong pt-4 mt-4 font-heading text-xs font-bold">
            <span>Dual-Agent Story</span>
            <span className="text-[#0b3dd0]">Instant ⚡</span>
          </div>
        </div>
        
        {/* Card 2 */}
        <div className="bg-[#fff2ee] border border-border-strong rounded-lg p-6 flex flex-col gap-4 shadow-sm text-left">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-md flex items-center justify-center border border-foreground shadow-[2px_2px_0px_0px_currentColor] bg-accent text-white">
              📄
            </div>
            <div className="bg-background border border-border-strong rounded-full py-1 px-3 font-heading text-[11px] font-extrabold text-foreground">
              MODALITY 02
            </div>
          </div>
          <h3 className="font-heading text-xl font-extrabold leading-[1.2]">PDF & Docx Ingestion</h3>
          <p className="text-sm leading-relaxed text-secondary">
            Extract complex financial statements, SEC filings, and 50+ page PDFs into structured charts and executive bullets.
          </p>
          
          <div className="bg-background border border-border rounded-md p-4 flex flex-col gap-2 mt-auto shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading text-[11px] font-bold text-accent">Document OCR</span>
              <span className="font-heading text-[11px] font-bold py-0.5 px-1.5 rounded bg-red-100 text-red-700">84 Pgs Analyzed</span>
            </div>
            <div className="bg-gray-100 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>Q3 Financial Model</span>
              <span className="text-accent">24 Tables</span>
            </div>
            <div className="bg-gray-100 rounded text-[10px] font-bold flex justify-between items-center text-foreground h-5 overflow-hidden p-0">
              <div className="w-[60%] h-full bg-accent"></div>
            </div>
          </div>
          
          <div className="flex justify-between items-center border-t border-border-strong pt-4 mt-4 font-heading text-xs font-bold">
            <span>Smart OCR Engine</span>
            <span className="text-accent">Up to 250 Pgs 📄</span>
          </div>
        </div>
        
        {/* Card 3 */}
        <div className="bg-[#f5f3ff] border border-border-strong rounded-lg p-6 flex flex-col gap-4 shadow-sm text-left">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-md flex items-center justify-center border border-foreground shadow-[2px_2px_0px_0px_currentColor] bg-primary text-white">
              ✏️
            </div>
            <div className="bg-background border border-border-strong rounded-full py-1 px-3 font-heading text-[11px] font-extrabold text-foreground">
              MODALITY 03
            </div>
          </div>
          <h3 className="font-heading text-xl font-extrabold leading-[1.2]">Napkin & Wireframe</h3>
          <p className="text-sm leading-relaxed text-secondary">
            Snap a phone photo of a whiteboard flowchart or app wireframe. Vision AI reconstructs editable vector shapes.
          </p>
          
          <div className="bg-background border border-border rounded-md p-4 flex flex-col gap-2 mt-auto shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading text-[11px] font-bold text-[#0b3dd0]">Vision Vectorizer</span>
              <span className="font-heading text-[11px] font-bold py-0.5 px-1.5 rounded bg-[#0b3dd0] text-white">Raster ➔ Vector</span>
            </div>
            <div className="bg-gray-100 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>Hand Sketch</span>
              <span className="bg-white py-0.5 px-1 rounded border border-gray-200">Editable SVG</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center border-t border-border-strong pt-4 mt-4 font-heading text-xs font-bold">
            <span>Shape Recognition</span>
            <span className="text-[#0b3dd0]">100% Vector 🎨</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#fffbe6] border border-border-strong rounded-lg p-6 flex flex-col gap-4 shadow-sm text-left">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-md flex items-center justify-center border border-foreground shadow-[2px_2px_0px_0px_currentColor] bg-highlight text-foreground">
              🌐
            </div>
            <div className="bg-background border border-border-strong rounded-full py-1 px-3 font-heading text-[11px] font-extrabold text-foreground">
              MODALITY 04
            </div>
          </div>
          <h3 className="font-heading text-xl font-extrabold leading-[1.2]">URL & Web Scraper</h3>
          <p className="text-sm leading-relaxed text-secondary">
            Paste Crunchbase, Notion, or pitch articles. Pulls verified market stats, citations, and competitor logos automatically.
          </p>
          
          <div className="bg-background border border-border rounded-md p-4 flex flex-col gap-2 mt-auto shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-heading text-[11px] font-bold text-[#181b25]">Live Citation Bridge</span>
              <span className="font-heading text-[11px] font-bold py-0.5 px-1.5 rounded bg-[#d4f933] text-[#181b25]">Verified</span>
            </div>
            <div className="bg-gray-100 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>🔗 crunchbase.com/co/zenith</span>
            </div>
            <div className="bg-white border border-gray-200 py-1.5 px-2 rounded text-[10px] font-bold flex justify-between items-center text-foreground">
              <span>Verified Round: $12M</span>
              <span className="text-emerald-600">✓</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center border-t border-border-strong pt-4 mt-4 font-heading text-xs font-bold">
            <span>Live Grounding</span>
            <span>Zero Hallucinations 🛡️</span>
          </div>
        </div>
      </div>
    </section>
  )
}
