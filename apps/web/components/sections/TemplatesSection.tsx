import React from 'react';

export function TemplatesSection() {
  return (
    <section className="bg-[#f3f4f9] py-24 px-6" id="templates">
      <div className="text-center mb-12 flex flex-col items-center">
        <div className="inline-block bg-secondary text-foreground py-1 px-3 font-heading font-extrabold text-xs rounded-sm border border-foreground shadow-[2px_2px_0px_0px_var(--color-text-primary)] mb-4">
          PRE-ENGINEERED BLUEPRINTS
        </div>
        <h2 className="text-4xl font-heading font-extrabold text-foreground mb-4 leading-[1.1] tracking-tight">
          Curated Decks Crafted with Tier-1 Partners
        </h2>
      </div>

      <div className="flex justify-center items-center gap-4 mb-12 flex-wrap">
        <button
          type="button"
          className="bg-foreground text-white border border-foreground py-2 px-4 rounded-full font-heading font-bold text-xs shadow-sm transition-colors"
        >
          ALL DECKS
        </button>
        <button
          type="button"
          className="bg-white text-foreground border border-border-strong py-2 px-4 rounded-full font-heading font-bold text-xs hover:border-foreground hover:bg-slate-100 transition-colors"
        >
          VC PITCH
        </button>
        <button
          type="button"
          className="bg-white text-foreground border border-border-strong py-2 px-4 rounded-full font-heading font-bold text-xs hover:border-foreground hover:bg-slate-100 transition-colors"
        >
          BOARD UPDATES
        </button>
        <button
          type="button"
          className="bg-white text-foreground border border-border-strong py-2 px-4 rounded-full font-heading font-bold text-xs hover:border-foreground hover:bg-slate-100 transition-colors"
        >
          PRODUCT ROADMAPS
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[1200px] mx-auto">
        {/* Card 1 */}
        <div className="bg-white border border-border-strong rounded-xl p-6 flex flex-col gap-4 shadow-sm text-left hover:border-foreground hover:shadow-solid transition-all">
          <div className="font-heading font-extrabold text-xs text-primary tracking-wider uppercase">
            INSTITUTIONAL VENTURE
          </div>
          <h3 className="font-heading font-extrabold text-xl text-foreground leading-[1.2]">
            HyperScale B2B SaaS Pitch
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Designed for $3M - $15M rounds. Focuses on cohort graphs, unit economics, and pipeline expansion.
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-white border border-border-strong rounded-xl p-6 flex flex-col gap-4 shadow-sm text-left hover:border-foreground hover:shadow-solid transition-all">
          <div className="font-heading font-extrabold text-xs text-primary tracking-wider uppercase">
            SEED & PRE-SEED
          </div>
          <h3 className="font-heading font-extrabold text-xl text-foreground leading-[1.2]">
            Series Seed AI & DeepTech
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Emphasizes proprietary model evaluations, team pedigree, compute moat, and early design partners.
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-white border border-border-strong rounded-xl p-6 flex flex-col gap-4 shadow-sm text-left hover:border-foreground hover:shadow-solid transition-all">
          <div className="font-heading font-extrabold text-xs text-primary tracking-wider uppercase">
            GOVERNANCE & OPS
          </div>
          <h3 className="font-heading font-extrabold text-xl text-foreground leading-[1.2]">
            Quarterly Executive Review
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Dense, authoritative structure for board members and executive reviews with built-in waterfall charts.
          </p>
        </div>
      </div>
    </section>
  );
}

export default TemplatesSection;
