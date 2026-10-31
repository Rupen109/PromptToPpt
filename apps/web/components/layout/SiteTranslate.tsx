'use client'

import { useEffect } from 'react'
import { getDeckLanguage, onDeckLanguageChange } from '@/lib/language'
import { syncSiteLanguage } from '@/lib/site-translate'

/**
 * Keeps the website's language in line with the language chosen in the header: on every page load (a saved choice translates the page again) and
 * whenever the choice changes. Renders the hidden holder Google's widget needs. English visitors never load anything from Google.
 */
export function SiteTranslate() {
  useEffect(() => {
    void syncSiteLanguage(getDeckLanguage())
    return onDeckLanguageChange(() => void syncSiteLanguage(getDeckLanguage()))
  }, [])
  return <div id="google_translate_element" translate="no" className="hidden" />
}
