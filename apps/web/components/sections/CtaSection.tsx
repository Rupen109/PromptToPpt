import React from 'react';

export function CtaSection() {
  return (
    <section className="pt-4 pb-24 px-6 bg-[#f3f4f9]">
      <div className="bg-secondary border-2 border-foreground shadow-[8px_8px_0px_0px_#181b25] rounded-3xl p-8 md:p-16 text-center max-w-[1000px] mx-auto">
        <div className="bg-white text-foreground border border-foreground inline-block py-1 px-3 font-heading font-extrabold text-xs rounded-sm shadow-[2px_2px_0px_0px_#181b25] mb-4">
          🚀 IMMEDIATE ACCELERATION
        </div>
        <h2 className="text-3xl md:text-4xl font-heading font-extrabold text-foreground leading-[1.1] mb-4 max-w-[800px] mx-auto">
          Stop Staring at Blank Slides. Build Your Deck in 45 Seconds.
        </h2>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-2 mt-8 mb-4">
          <input
            type="email"
            placeholder="Enter your work email..."
            className="py-3 px-4 text-base rounded-md border-2 border-border-strong w-full sm:w-[300px] bg-white text-foreground placeholder:text-slate-400 focus:outline-none focus:border-foreground"
          />
          <button className="bg-primary hover:bg-primary-hover text-white px-8 py-3 rounded-md font-heading font-bold text-[1.2rem] shadow-solid hover:-translate-y-0.5 hover:shadow-[4px_6px_0px_0px_#181b25] transition-all cursor-pointer">
            START FREE
          </button>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">
          No credit card required • 3 free presentations included
        </p>
      </div>
    </section>
  );
}

export default CtaSection;
