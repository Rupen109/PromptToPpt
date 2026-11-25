import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import Link from 'next/link'
import { CookieSettingsButton } from '@/components/legal/CookieConsent'
import { LegalPage, SupportMail } from '@/components/legal/LegalPage'
import { TURNSTILE_SITE_KEY } from '@/lib/env'

export const metadata: Metadata = withShare({
  title: 'Cookie notice',
  description: 'Which cookies and similar storage SlidesDone uses, what each is for, and how to accept or refuse analytics cookies.',
  alternates: { canonical: '/cookies' },
})

export default function Page() {
  return (
    <LegalPage path="/cookies" title="Cookie notice" intro="We use the cookies needed to keep you signed in and remember your choices. Analytics cookies are off unless you accept them.">
      <h2 id="essential">1. Cookies and storage we always use (essential)</h2>
      <p>These are needed for the service to work, so they do not need your consent and cannot be switched off in our banner. You can block them in your browser, but then sign-in and other features will not work.</p>
      <div className="sd-table">
        <table>
          <caption className="sr-only">Essential cookies and browser storage</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Purpose</th><th scope="col">Lasts</th></tr></thead>
          <tbody>
            <tr><th scope="row">Sign-in session cookie (set by our login system, name contains “better-auth”)</th><td>Keeps you signed in on the website and the editor. HTTP-only; shared across our own sub-domains.</td><td>Up to 30 days, or until you sign out</td></tr>
            <tr><th scope="row">Cookie choice (<code>sd-consent</code>, browser storage)</th><td>Remembers whether you accepted or refused analytics.</td><td>Until you change it or clear your browser data</td></tr>
            <tr><th scope="row">Language choice (browser storage)</th><td>Remembers the language you picked.</td><td>Until you clear your browser data</td></tr>
            <tr><th scope="row">Editor working storage (browser storage)</th><td>Keeps your prompt and options while you sign up, an unsaved copy of the deck you are editing, and the proof that you opened a password-protected share link.</td><td>This visit (session) or until the deck is saved</td></tr>
            <tr><th scope="row">Viewer id for share links (browser storage, not a cookie)</th><td>A random id so a share-link owner can count visitors without personal data. Not used when your browser sends Do Not Track or Global Privacy Control.</td><td>Until you clear your browser data</td></tr>
            {TURNSTILE_SITE_KEY && <tr><th scope="row">Cloudflare Turnstile</th><td>Bot check on sign-up and sign-in; set by Cloudflare.</td><td>As set by Cloudflare</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 id="optional">2. Optional cookies: analytics (only if you accept)</h2>
      <p>If you click “Accept cookies”, we load Google Analytics on the public website. It sets cookies whose names start with <code>_ga</code> (up to about two years) to count visits and see which pages are useful. It receives page views and technical details from your browser. It never receives your prompts, files or slides. If you click “Refuse” (or ignore the banner), Google Analytics is not loaded and sets nothing. We do not use advertising or tracking cookies.</p>
      <p>Your current choice: <CookieSettingsButton /></p>

      <h2 id="third">3. Other third-party requests</h2>
      <ul>
        <li><strong>Translation.</strong> If you choose a language other than English, Google’s Website Translator is loaded and stores a <code>googtrans</code> cookie to remember it. Nothing is loaded for English.</li>
        <li><strong>Fonts.</strong> The editor app loads fonts from Google Fonts, which can see your IP address.</li>
        <li><strong>Payments.</strong> When you subscribe, Razorpay’s checkout opens and Razorpay sets its own cookies under its notice.</li>
      </ul>

      <h2 id="more">4. More</h2>
      <p>See the <Link href="/privacy">Privacy Policy</Link> for how we handle personal data. Questions about cookies: <SupportMail />.</p>
    </LegalPage>
  )
}
