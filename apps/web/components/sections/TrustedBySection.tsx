import React from 'react';

export function TrustedBySection() {
  return (
    <section className="bg-background py-8 px-6 border-b border-border text-center">
      <h3 className="font-heading text-xs font-extrabold text-slate-500 mb-6 tracking-wider">
        TRUSTED BY EXECUTIVES AT 4,000+ COMPANIES
      </h3>
      <div className="flex justify-center items-center gap-8 md:gap-12 font-heading text-xl font-extrabold text-foreground flex-wrap">
        <span>Vercel</span>
        <span>OpenAI</span>
        <span>Salesforce</span>
        <span>Sequoia</span>
        <span>Stripe</span>
      </div>
    </section>
  );
}

export default TrustedBySection;
