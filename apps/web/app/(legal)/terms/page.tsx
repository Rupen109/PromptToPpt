import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Operator, Owner, SupportMail } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using SlidesDone: your account, plans and credits, your content and AI output, acceptable use, and how we handle disputes.',
  alternates: { canonical: '/terms' },
}

export default function Page() {
  return (
    <LegalPage path="/terms" title="Terms of Service" intro="These terms are the agreement between you and us when you use SlidesDone. Please read them; they are written to be understood.">
      <h2 id="who">1. Who we are and what this covers</h2>
      <p>SlidesDone (the “service”) is an AI presentation maker available at {LEGAL.websiteHost} and its sub-domains (the website, the editor and the free tools). It is run by <Operator /> (“we”, “us”). By creating an account or using the service you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>, <Link href="/cookies">Cookie notice</Link> and <Link href="/refunds">Cancellation and refund policy</Link>, which form part of this agreement. If you do not agree, please do not use the service.</p>

      <h2 id="account">2. Your account</h2>
      <ul>
        <li>You must be at least {LEGAL.minimumAge} years old (or the age of majority where you live) and able to enter a binding contract. If you use the service for an organisation, you confirm you may bind it.</li>
        <li>Give accurate details and keep your password safe. You are responsible for what happens under your account. Tell us at once at <SupportMail /> if you think it was accessed without your permission.</li>
        <li>One person, one account. Creating many accounts to collect free credits is not allowed and may lead to those accounts being closed.</li>
        <li>You can sign up with an e-mail address and password, or with a Google or Microsoft account where we offer it. We may ask you to confirm your e-mail address before you can use paid features or AI.</li>
      </ul>

      <h2 id="plans">3. Plans, credits and limits</h2>
      <ul>
        <li><strong>Free plan.</strong> Every account starts on a free plan with a monthly allowance of credits and smaller limits. Free decks carry a SlidesDone watermark and some features, such as exporting, are not included.</li>
        <li><strong>Paid plans.</strong> The current plans, prices, credits and limits are shown on the <Link href="/pricing">pricing page</Link>. Prices shown for customers in India include GST; for other customers any applicable tax is shown at checkout.</li>
        <li><strong>Credits.</strong> AI work (writing slides, AI edits, pictures, reading media and similar) uses credits. The credits of a plan are granted for each billing period and <strong>do not roll over</strong>: unused credits are not carried to the next period and have no cash value. When you move to a higher plan, your balance is reset to the new plan’s allowance.</li>
        <li><strong>Other limits.</strong> Plans also limit things such as presentations per month, slides per presentation, pictures, file sizes, animated (Morph) decks per month and the formats you can export. We enforce these limits on our servers. Fair-use limits (for example per minute and per day) protect the service for everyone.</li>
        <li><strong>Changes.</strong> We may change plans, prices, credits and limits. A change to the price of a plan you already pay for applies from your next renewal and we will tell you beforehand. We will not take a higher price from you without that notice.</li>
      </ul>

      <h2 id="billing">4. Payments, renewal and cancellation</h2>
      <p>Paid plans are subscriptions that renew automatically each month or year until you cancel. Payments are processed by Razorpay; we do not see or store your full card or UPI details. You can cancel renewal at any time from the billing page of the editor and you keep your plan until the end of the period you paid for. If a renewal payment keeps failing, your paid access ends. Switching to another paid plan ends the old subscription straight away. Refunds are covered in the <Link href="/refunds">Cancellation and refund policy</Link>.</p>

      <h2 id="content">5. Your content and what the AI produces</h2>
      <ul>
        <li><strong>You own your content.</strong> The prompts, files, links and pictures you add, and the presentations you create, remain yours. As between you and us, you also own the presentations made for you by the AI to the extent the law lets anyone own them and subject to the rights of others in material you supplied.</li>
        <li><strong>Permission you give us.</strong> You allow us to store, process, display and send your content to the providers described in the Privacy Policy, only so that we can run the service for you (for example to write your slides, find pictures, export and share your presentations, keep backups and prevent abuse). We do not use your content to train AI models.</li>
        <li><strong>You are responsible for your content.</strong> You confirm you have the right to use what you upload and to ask the AI to work on it, and that it does not break the law or anyone’s rights.</li>
        <li><strong>AI output can be wrong.</strong> AI-generated text, figures, charts, summaries and pictures may be inaccurate, out of date, incomplete, biased or similar to what others receive. Check facts, numbers, names, quotations and sources before you present or publish. Output is not legal, medical, financial or other professional advice. You are responsible for how you use it.</li>
        <li><strong>Sharing.</strong> A share link lets anyone who has the link (and the password, if you set one) view that presentation. Collaborators you invite can see and edit what you let them. Share only what you are happy for those people to see.</li>
      </ul>

      <h2 id="ours">6. Our content, templates and third-party pictures</h2>
      <ul>
        <li>The service, its software, designs, themes, templates (including Morph animation templates), layouts and brand are ours or our licensors’. We give you a personal, non-exclusive, non-transferable right to use them inside the service and in the presentations you make with it. You may not copy, resell or redistribute the templates or designs themselves, or scrape or reverse-engineer the service.</li>
        <li>Stock pictures come from <a href="https://unsplash.com/license" rel="noopener noreferrer">Unsplash</a> and <a href="https://www.pexels.com/license/" rel="noopener noreferrer">Pexels</a> and are used under their licences. Where a picture carries a credit, please keep it. Do not use these pictures as a standalone product or in ways their licences forbid.</li>
        <li>If you upload a PowerPoint or PDF to reuse its design, you confirm you are allowed to use that file’s design.</li>
        <li>Feedback you send us may be used by us to improve the service without obligation to you.</li>
      </ul>

      <h2 id="use">7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break any law, or create or share content that is illegal, hateful, harassing, sexually exploitative (especially anything involving minors), defamatory, deceptive (such as fake news, scams or phishing), or that infringes someone’s intellectual-property or privacy rights;</li>
        <li>upload files you are not allowed to process, or personal data of other people without a lawful reason;</li>
        <li>try to get around plan limits, credits, rate limits, the watermark or other protections, or to use the service from automated tools or bots that we have not approved;</li>
        <li>probe, attack, overload or break into the service, other accounts or our providers, or send malware;</li>
        <li>ask the service to fetch addresses on private or internal networks, or use it to attack other sites (for example through the sitemap tool);</li>
        <li>use the service to build a competing product, or to train other AI models on its output at scale;</li>
        <li>resell the service, or let others use your account.</li>
      </ul>
      <p>We may remove content and suspend or close accounts that break this section.</p>

      <h2 id="free-tools">8. Free tools</h2>
      <p>Some tools on the website work without an account. Some run entirely in your browser, others send what you provide to our servers and AI providers to produce the result. They have daily limits, are provided as they are, and may change or be withdrawn.</p>

      <h2 id="availability">9. Availability and changes to the service</h2>
      <p>We work to keep the service running but cannot promise it will always be available or error-free. We may add, change or remove features, and carry out maintenance. Features that depend on AI providers or other third parties can be slow or unavailable when those providers are. Keep your own copy of important presentations by exporting them where your plan allows.</p>

      <h2 id="end">10. Ending the agreement</h2>
      <ul>
        <li>You can stop using the service at any time and cancel your plan as described in section 4. To have your account and data deleted, write to <Owner k="dataProtectionEmail" /> (see the Privacy Policy).</li>
        <li>We may suspend or end your access if you break these terms, if your use puts the service or others at risk, if a payment is reversed or disputed, or if the law requires. Where reasonable we will tell you why and give you a chance to fix the problem first. We may also close accounts that have been unused for a long time after warning you.</li>
        <li>When your account ends, your right to use the service ends. Sections that by their nature should continue (for example about content, liability and disputes) continue.</li>
      </ul>

      <h2 id="warranty">11. Disclaimers</h2>
      <p>The service is provided “as is” and “as available”. To the extent the law allows, we do not promise that the service or the AI output will be accurate, suitable for a particular purpose, uninterrupted or free of errors, and we disclaim all warranties not stated in these terms. Nothing here limits rights you have as a consumer under the law that cannot be waived.</p>

      <h2 id="liability">12. Limit of our liability</h2>
      <p>To the extent the law allows: we are not liable for indirect or consequential loss, loss of profits, revenue, business, goodwill or data, or for loss caused by AI output, by third-party services, or by events beyond our reasonable control. Our total liability to you for all claims about the service is limited to the amount you paid us in the 12 months before the claim arose (or ₹1,000 if you only used the free plan). Nothing in these terms limits liability that cannot be limited by law, such as for fraud or wilful misconduct.</p>

      <h2 id="indemnity">13. If your use causes us a claim</h2>
      <p>You agree to cover reasonable losses we suffer from a third-party claim caused by your content or by your breach of these terms, to the extent the law allows.</p>

      <h2 id="law">14. Governing law and disputes</h2>
      <p>These terms are governed by the laws of India. Please first contact us (section 17) so we can try to solve a problem informally. If that does not work, the courts at <Owner k="governingLawCity" />, India have exclusive jurisdiction, without taking away any right you have under mandatory consumer law to go to the forum that law gives you.</p>

      <h2 id="changes">15. Changes to these terms</h2>
      <p>We may update these terms, for example when we add features or the law changes. The effective date at the top shows the current version. For material changes we will give notice, usually by e-mail or in the product, before they apply to you. If you keep using the service after the change takes effect, you accept the new terms; if you do not agree, you can stop using the service and cancel.</p>

      <h2 id="general">16. General</h2>
      <p>These terms and the policies they refer to are the whole agreement between us about the service. If a part is found unenforceable, the rest stays in force. If we do not enforce a right straight away, we have not given it up. You may not transfer your rights under these terms without our consent; we may transfer ours as part of a business transfer. We may notify you by e-mail, in the product or on this website.</p>

      <h2 id="contact">17. Contact and grievances</h2>
      <p>Questions: <SupportMail /> or the <Link href="/support">support form</Link>. Complaints: our Grievance Officer is <Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" />. We acknowledge complaints within {LEGAL.grievanceAcknowledgeHours} hours and aim to resolve them within {LEGAL.grievanceResolveDays} days. Address: <Operator />. GSTIN: <Owner k="gstin" />.</p>
    </LegalPage>
  )
}
