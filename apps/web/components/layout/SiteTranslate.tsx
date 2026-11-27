'use client'

import { useEffect } from 'react'
import { getDeckLanguage, onDeckLanguageChange } from '@/lib/language'
import { googleCodeFor, likelyToTranslate, preloadWidget, syncSiteLanguage } from '@/lib/site-translate'

/**
 * Keeps the website's language in line with the language chosen in the header: on every page load (a saved choice translates the page again) and
 * whenever the choice changes. Renders the hidden holder Google's widget needs. Visitors with an English browser load nothing from Google until they reach for the language button.
 */
export function SiteTranslate() {
  useEffect(() => {
    void syncSiteLanguage(getDeckLanguage())
    // a visitor whose browser speaks one of our other languages will likely switch: have the translator ready, after the page itself has loaded
    if (likelyToTranslate() && !googleCodeFor(getDeckLanguage())) {
      const go = () => preloadWidget()
      if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 2000)
    }
    return onDeckLanguageChange(() => void syncSiteLanguage(getDeckLanguage()))
  }, [])
  return <div id="google_translate_element" translate="no" className="hidden" />
}
