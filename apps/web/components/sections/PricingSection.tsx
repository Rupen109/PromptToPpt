import React from 'react';

export function PricingSection() {
  return (
    <section className="bg-background py-24 px-6" id="pricing">
      <div className="text-center mb-12 flex flex-col items-center">
        <div className="inline-block bg-secondary text-foreground py-1 px-3 font-heading font-extrabold text-xs rounded-sm border border-foreground shadow-[2px_2px_0px_0px_var(--color-text-primary)] mb-4">
          HONEST SAAS PRICING
        </div>
        <h2 className="text-4xl font-heading font-extrabold text-foreground mb-4 leading-[1.1] tracking-tight">
          Invest in Closed Deals, Not Slide Fatigue
        </h2>
      </div>

      <div className="flex justify-center mb-12">
        <div className="bg-[#f3f4f9] p-1 rounded-full inline-flex items-center border border-border">
          <button
            type="button"
            className="py-2 px-6 rounded-full font-heading font-extrabold text-xs text-foreground/70 hover:text-foreground transition-colors"
          >
            MONTHLY
          </button>
          <button
            type="button"
            className="py-2 px-6 rounded-full font-heading font-extrabold text-xs bg-secondary text-foreground shadow-sm"
          >
            ANNUAL (SAVE 25% 🔥)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1000px] mx-auto">
        {/* Starter Plan */}
        <div className="bg-[#fffbe6] border border-border-strong rounded-xl p-6 flex flex-col gap-4 shadow-sm text-left">
          <h3 className="font-heading font-extrabold text-xl text-foreground leading-[1.2]">Starter</h3>
          <div className="text-5xl font-extrabold text-foreground leading-none">$0</div>
          <p className="text-sm text-slate-600 leading-relaxed">
            3 free pitch decks per month. Prompt to PPT synthesis.
          </p>
        </div>

        {/* Pro Maker Plan */}
        <div className="bg-foreground text-white border-2 border-foreground rounded-xl p-6 flex flex-col gap-4 shadow-lg text-left relative">
          <div className="font-heading font-extrabold text-xs text-highlight tracking-wider uppercase">
            MOST POPULAR
          </div>
          <h3 className="font-heading font-extrabold text-xl text-white leading-[1.2]">Pro Maker</h3>
          <div className="text-5xl font-extrabold text-secondary leading-none">$24</div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Unlimited AI deck generation. PDF & wireframe ingestion. Native PPTX export.
          </p>
        </div>

        {/* Enterprise Plan */}
        <div className="bg-[#fff2ee] border border-border-strong rounded-xl p-6 flex flex-col gap-4 shadow-sm text-left">
          <h3 className="font-heading font-extrabold text-xl text-foreground leading-[1.2]">Enterprise</h3>
          <div className="text-5xl font-extrabold text-foreground leading-none">Custom</div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Unlimited brand kits. Okta SAML SSO. SOC2 Type II. Dedicated private model.
          </p>
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
