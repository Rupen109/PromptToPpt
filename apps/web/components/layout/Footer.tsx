import React from 'react';

export function Footer() {
  return (
    <footer className="bg-white border-t border-border py-12 px-6 text-center text-sm text-slate-600">
      <p>© {new Date().getFullYear()} promptToPpt. All rights reserved.</p>
    </footer>
  );
}

export default Footer;
