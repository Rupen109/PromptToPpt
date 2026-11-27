import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import Link from 'next/link'
import { LegalPage, Operator, Owner, SupportMail } from '@/components/legal/LegalPage'
import { GOOGLE_AUTH, MICROSOFT_AUTH, TURNSTILE_SITE_KEY } from '@/lib/env'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = withShare({
  title: 'Privacy Policy',
  description: 'What personal data SlidesDone collects, how your content is processed by AI providers, who else receives it, how long we keep it, and how to export or delete your data.',
  alternates: { canonical: '/privacy' },
})

const PROCESSORS: { who: string; what: string; data: string }[] = [
  { who: 'Amazon Web Services (AWS), Mumbai region', what: 'Hosting, database, file storage, content delivery and backups', data: 'Everything described in section 2, stored on our servers' },
  { who: 'Google (Gemini AI models, through the Gemini API)', what: 'Our AI provider: writing slides, reading pictures and media, AI edits, web research and AI pictures', data: 'Your prompt, the text of your sources, slide text you ask the AI to edit, pictures or audio you ask it to read, your assistant chat' },
  { who: 'OpenRouter (a backup route to the same Google Gemini models)', what: 'Only when Google’s service is unavailable or at its limits: the same AI work is sent through OpenRouter to the same Gemini models, so your request still completes', data: 'The same content as above, for those requests only' },
  { who: 'Razorpay', what: 'Taking payments for paid plans, renewals and refunds', data: 'Your name, e-mail and payment details, which you enter on Razorpay’s checkout; we receive payment status and ids, not card numbers' },
  { who: 'Brevo', what: 'Sending service e-mails (confirmation, password reset, receipts, invitations, shared links)', data: 'Your e-mail address, name and the message' },
  { who: 'Unsplash and Pexels', what: 'Finding stock pictures for slides', data: 'Short search words taken from your slide topic (not your name or account); the picture is then copied to our storage' },
  { who: 'Google Analytics', what: 'Counting visits to the public website, only if you accept analytics cookies', data: 'Page views and technical data from your browser; never your prompts, files or slides' },
  { who: 'Google Fonts', what: 'Fonts in the editor app', data: 'Your IP address and browser details, when the editor loads its fonts' },
  { who: 'Google Website Translator', what: 'Translating the website when you pick a language other than English', data: 'The text of the page you are viewing, only after you pick a language. To make that quick, Google\'s script is loaded in advance when you reach for the language button, or when your browser is set to one of our other languages; nothing is translated or sent before you choose' },
  ...(GOOGLE_AUTH ? [{ who: 'Google sign-in', what: 'Letting you sign in with a Google account', data: 'Your name, e-mail and profile details Google shares with us' }] : []),
  ...(MICROSOFT_AUTH ? [{ who: 'Microsoft sign-in', what: 'Letting you sign in with a Microsoft account', data: 'Your name, e-mail and profile details Microsoft shares with us' }] : []),
  ...(TURNSTILE_SITE_KEY ? [{ who: 'Cloudflare Turnstile', what: 'Checking that sign-up and sign-in come from a person, not a bot', data: 'Your IP address and browser signals' }] : []),
]

export default function Page() {
  return (
    <LegalPage path="/privacy" title="Privacy Policy" intro="What we collect when you use SlidesDone, why, who else sees it, how long we keep it, and what you can ask us to do with it.">
      <h2 id="who">1. Who is responsible</h2>
      <p>The service is run by <Operator />. We decide why and how your personal data is used, so we are the “data fiduciary” (controller) for it. Privacy contact: <Owner k="dataProtectionEmail" />. General support: <SupportMail />.</p>

      <h2 id="collect">2. What we collect</h2>
      <ul>
        <li><strong>Account.</strong> Name, e-mail address and your password (stored only as a one-way hash, never in readable form). If you sign in with Google or Microsoft, the name, e-mail and profile details they share. What you mostly make presentations for, if you answer the one question we ask when you first open the app (for example “Marketing and brand” or “Student”); we use it to make SlidesDone more useful for the people who use it. Sign-in sessions keep the IP address and browser description of the device.</li>
        <li><strong>Your content.</strong> The prompts you write; the sources you add (we read uploaded files, links, pictures and recordings and keep the <em>text</em> we extract as a source; the original uploaded file is read and not kept as a file, and a big video or audio file is kept only while it is being processed); presentations, versions and comments; assistant chats; brand kits; pictures you upload to the editor; designs you upload from PowerPoint or PDF files; and the people you invite to collaborate (their e-mail addresses).</li>
        <li><strong>Pictures made for you.</strong> Stock pictures you use and AI-made pictures are copied to our private storage so your slides keep working.</li>
        <li><strong>Use of the service.</strong> A ledger of credits and AI use (which model, how much work, the cost to us), generation jobs, and plan limits.</li>
        <li><strong>Payments.</strong> Your plan, amounts, currency, payment and subscription ids and status from Razorpay. We choose Indian rupees or US dollars from the country your request appears to come from. We do not store card or UPI details.</li>
        <li><strong>Support.</strong> Messages and attachments you send us, with your e-mail and, if you were signed in, your account.</li>
        <li><strong>Technical data.</strong> Your IP address and browser details are used to limit abuse (rate limits, sign-up and sign-in attempt limits, admin audit records, support messages) and appear in server logs.</li>
        <li><strong>Viewers of shared presentations.</strong> If you share a link, we count visits to it for you (see section 6). We do not store viewers’ IP addresses or browser text.</li>
        <li><strong>Website analytics.</strong> Only if you accept analytics cookies (see the <Link href="/cookies">Cookie notice</Link>).</li>
      </ul>

      <h2 id="why">3. Why we use it</h2>
      <p>To provide the service you asked for (create, edit, store, share and export presentations); to take payments and keep records; to keep the service secure and stop abuse and fraud; to answer you; to send service e-mails (confirmations, password resets, receipts, invitations and notices about your plan; we do not send marketing e-mail at present); to improve and fix the service using aggregated usage; and to meet legal obligations. Our legal basis is your agreement to our terms, your consent where we ask for it (for example analytics cookies), our legitimate interest in running and protecting the service, and legal duty.</p>

      <h2 id="ai">4. How AI uses your content</h2>
      <ul>
        <li>To make your presentation, your prompt, the text of your sources and your instructions are sent to AI providers (see section 5). This is how the AI writes slides, edits them, reads pictures and recordings, researches a topic on the web (your search topic is sent to a model with web search) and makes pictures (the picture description is sent).</li>
        <li><strong>We do not use your content to train AI models</strong>, ours or anyone else’s, and we do not sell it.</li>
        <li>
          {LEGAL.aiNoTrainingConfirmed.toUpperCase() === 'TODO'
            ? <>We use paid commercial API access with our AI providers, under terms that do not allow them to train their models on what we send. <Owner k="aiNoTrainingConfirmed" /></>
            : <>We use paid commercial API access with our AI providers, under terms that do not allow them to train their models on what we send (last checked {LEGAL.aiNoTrainingConfirmed}).</>}
        </li>
        <li>Providers handle requests under their own terms and privacy policies. Every plan uses Google’s Gemini models: the plan decides which one, and on the Premium plan you can choose between them.</li>
        <li>Do not put into a prompt or source anything you are not allowed to share with a service provider, and avoid sensitive personal data (health, financial account numbers, government ids) unless you really need it.</li>
      </ul>

      <h2 id="processors">5. Who else receives data</h2>
      <p>We share data only with the service providers below, and only what they need for the stated purpose. We do not sell personal data. We may also disclose data if the law or a valid legal request requires it, or to protect our rights and users’ safety, and to a successor if the business is transferred.</p>
      <div className="sd-table">
        <table>
          <caption className="sr-only">Service providers that receive data</caption>
          <thead><tr><th scope="col">Provider</th><th scope="col">Used for</th><th scope="col">Data they receive</th></tr></thead>
          <tbody>
            {PROCESSORS.map((p) => <tr key={p.who}><th scope="row">{p.who}</th><td>{p.what}</td><td>{p.data}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p>People you invite or share with can see the presentation you give them access to. Other users cannot see your account data, decks or sources.</p>

      <h2 id="share">6. Share-link statistics</h2>
      <p>When someone opens a link you shared, the viewer page tells us that it was opened and how long each slide was shown. We store only coarse information: a random id kept in the viewer’s own browser storage and turned into a one-way code that is different for every presentation, the country (from the network edge), the device type (phone, tablet or computer), the website the viewer came from (host name only) and timings. We store no IP address, no browser text and no cookie. Nothing is recorded if the viewer’s browser sends “Do Not Track” or Global Privacy Control. Visits are kept for up to 400 days, and the owner can clear a presentation’s statistics at any time.</p>

      <h2 id="retention">7. How long we keep data</h2>
      <div className="sd-table">
        <table>
          <caption className="sr-only">Retention periods</caption>
          <thead><tr><th scope="col">Data</th><th scope="col">Kept</th></tr></thead>
          <tbody>
            <tr><th scope="row">Account, presentations, sources, pictures, chats</th><td>While your account is open. Deleting a presentation removes it from your account at once; it is permanently erased when you ask us to delete your account or the presentation.</td></tr>
            <tr><th scope="row">Anonymous draft and files from the free tools or the home page before you sign up</th><td>About 1 hour, then deleted automatically.</td></tr>
            <tr><th scope="row">Share-link statistics</th><td>Up to 400 days.</td></tr>
            <tr><th scope="row">Payment and invoice records</th><td>As long as tax, accounting and other laws require, even after account deletion.</td></tr>
            <tr><th scope="row">Security records (sign-in attempts, abuse limits, audit records)</th><td>As long as needed to keep the service safe.</td></tr>
            <tr><th scope="row">Backups</th><td>Database backups are kept for 14 days and disk snapshots for about a week at most; an encrypted copy is also kept for about 30 days. Data deleted from the live service can remain in these backups until they expire, and is not used for anything else.</td></tr>
          </tbody>
        </table>
      </div>

      <h2 id="rights">8. Your choices: access, export and deletion</h2>
      <p>Depending on where you live, laws such as India’s Digital Personal Data Protection Act, 2023 and the EU and UK GDPR give you rights to access your data, correct it, have it erased, withdraw consent, nominate someone to act for you and complain. We act on these requests wherever you live.</p>
      <ul>
        <li><strong>In the product.</strong> You can open, edit, duplicate and delete your presentations and sources, remove people you invited, clear share-link statistics, delete uploaded designs, cancel your plan, and (on plans that include export) download your presentations as PowerPoint, PDF and pictures.</li>
        <li><strong>Delete your account and data.</strong> Write to <Owner k="dataProtectionEmail" /> from the e-mail address of your account. We confirm that it is you, then delete your account and the content linked to it within {LEGAL.dataRequestDays} days, except records we must keep by law (section 7). Remaining copies in backups expire as described above.</li>
        <li><strong>Get a copy of your data.</strong> Write to the same address. We send you your account details, your presentations and your sources in a common file format within {LEGAL.dataRequestDays} days.</li>
        <li><strong>Cookies and analytics.</strong> Change your choice any time (see the <Link href="/cookies">Cookie notice</Link>).</li>
        <li><strong>Complaints.</strong> Contact our Grievance Officer, <Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" />. We acknowledge within {LEGAL.grievanceAcknowledgeHours} hours and aim to resolve within {LEGAL.grievanceResolveDays} days. If you are not satisfied you may contact the Data Protection Board of India or the data protection authority where you live.</li>
      </ul>

      <h2 id="where">9. Where data is processed</h2>
      <p>Our servers are in India (AWS Mumbai). Our AI, e-mail, payment and analytics providers may process data in other countries, including outside India and the European Economic Area. By using the service you understand your data may be transferred there, and we choose providers that commit to protecting it.</p>

      <h2 id="security">10. Security</h2>
      <p>We protect data with encrypted connections, hashed passwords, private storage, access checks on every request, limits against abuse and regular backups. No system is perfectly secure; if a breach affects you we will tell you and the authorities as the law requires.</p>

      <h2 id="children">11. Children</h2>
      <p>The service is for people aged {LEGAL.minimumAge} and over. We do not knowingly collect data from children; if you believe a child has given us data, write to us and we will delete it.</p>

      <h2 id="changes">12. Changes</h2>
      <p>We will update this policy when what we do changes. The effective date is at the top and we will give notice of material changes by e-mail or in the product.</p>

      <h2 id="contact">13. Contact</h2>
      <p><Operator />. Privacy: <Owner k="dataProtectionEmail" />. Support: <SupportMail />.</p>
    </LegalPage>
  )
}
