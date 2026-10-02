import React from 'react';

export function FaqSection() {
  return (
    <section className="pt-24 pb-12 px-6 bg-[#f3f4f9]">
      <div className="max-w-[800px] mx-auto">
        <div className="text-center mb-12 flex flex-col items-center">
          <div className="bg-secondary text-foreground inline-block py-1 px-3 font-heading font-extrabold text-xs rounded-sm border border-foreground shadow-[2px_2px_0px_0px_#181b25] mb-4">
            CLEAR ANSWERS
          </div>
          <h2 className="text-4xl font-heading font-extrabold text-foreground leading-[1.1]">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white border border-border-strong rounded-md p-6 font-heading font-bold text-lg text-foreground flex justify-between items-center cursor-pointer hover:border-foreground transition-colors">
            <span>Are the exported presentations really 100% editable in PowerPoint?</span>
            <span className="text-xl font-bold ml-4">+</span>
          </div>
          <div className="bg-white border border-border-strong rounded-md p-6 font-heading font-bold text-lg text-foreground flex justify-between items-center cursor-pointer hover:border-foreground transition-colors">
            <span>Is my sensitive financial model or confidential pitch IP safe?</span>
            <span className="text-xl font-bold ml-4">+</span>
          </div>
          <div className="bg-white border border-border-strong rounded-md p-6 font-heading font-bold text-lg text-foreground flex justify-between items-center cursor-pointer hover:border-foreground transition-colors">
            <span>What is the page limit for PDF and financial spreadsheet ingestion?</span>
            <span className="text-xl font-bold ml-4">+</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
