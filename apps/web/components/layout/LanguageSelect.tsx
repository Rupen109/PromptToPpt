'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ChevronDown, Globe, Loader2 } from '@prompttoppt/ui/icons'
import { isTranslating, onTranslating, preloadWidget } from '@/lib/site-translate'
import { DEFAULT_LANGUAGE, SITE_LANGUAGES, getDeckLanguage, onDeckLanguageChange, setDeckLanguage } from '@/lib/language'

/**
 * The language of the website and of the presentations the AI writes (and the website's own text). One choice for the whole site: the header, the box where you type your prompt and the
 * phone menu all show the same value. Saved on this device and carried into the editor. A native <select> keeps it keyboard- and screen-reader-friendly
 * and gives phones their own picker.
 */
export function LanguageSelect({ variant = 'header' }: { variant?: 'header' | 'full' | 'chip' }) {
  const code = useSyncExternalStore(onDeckLanguageChange, getDeckLanguage, () => DEFAULT_LANGUAGE) // the server renders English; a saved choice shows after hydration
  const root = useRef<HTMLLabelElement>(null)
  // the first time a language button is on screen, fetch Google's translate script quietly in the background (once), so choosing a language is fast; nothing is translated and no page text is sent until someone chooses
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      const go = () => preloadWidget()
      if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1200) // after the page itself has loaded
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const translating = useSyncExternalStore(onTranslating, isTranslating, () => false)
  const lang = SITE_LANGUAGES.find((l) => l.code === code) ?? SITE_LANGUAGES[0]
  const label = variant === 'header' ? lang.code.toUpperCase() : lang.label
  const size = variant === 'chip' ? 'h-9 text-xs' : 'h-10 text-sm'
  return (
    <label ref={root} translate="no" aria-busy={translating} title={translating ? 'Translating the page…' : 'The language of the website and of your presentations'} className={`relative inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-white ${size} pl-2.5 pr-2 font-heading font-bold text-foreground hover:bg-[#f8f9fc] focus-within:ring-2 focus-within:ring-primary ${variant === 'full' ? 'w-full justify-between' : ''}`}>
      {translating ? <Loader2 aria-hidden size={16} className="shrink-0 animate-spin" /> : <Globe aria-hidden size={16} className="shrink-0" />}
      {variant !== 'header' && <span className="text-[#64748b] font-semibold hidden sm:inline">Language:</span>}
      <span aria-hidden className={variant === 'full' ? 'flex-1 truncate' : 'whitespace-nowrap'}>{label}</span>
      <ChevronDown aria-hidden size={14} className="shrink-0" />
      <select aria-label="Presentation language" value={code} onFocus={preloadWidget} onPointerDown={preloadWidget} onChange={(e) => setDeckLanguage(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        {SITE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )
}
