import React from 'react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border py-4 px-6">
      <div className="max-w-[1200px] mx-auto flex justify-between items-center">
        <div className="font-heading font-extrabold text-xl text-foreground">promptToPpt</div>
        
        <nav className="hidden md:flex gap-6">
          <Link href="#product" className="text-slate-600 font-medium text-sm hover:text-primary transition-colors">
            Product
          </Link>
          <Link href="#templates" className="text-slate-600 font-medium text-sm hover:text-primary transition-colors">
            Templates
          </Link>
          <Link href="#pricing" className="text-slate-600 font-medium text-sm hover:text-primary transition-colors">
            Pricing
          </Link>
        </nav>
        
        <div className="flex gap-4 items-center">
          <Link href="/login" className="font-bold text-sm hover:text-primary transition-colors">
            Log In
          </Link>
          <Link href="/signup" className="bg-primary text-white py-2 px-4 rounded-md font-bold text-sm shadow-solid hover:-translate-y-[2px] transition-transform">
            Sign Up Free
          </Link>
        </div>
      </div>
    </header>
  );
}
