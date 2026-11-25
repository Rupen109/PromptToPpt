import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import Link from 'next/link'
import { LEGAL_PAGES, LegalPage, Operator, Owner, SupportMail } from '@/components/legal/LegalPage'

export const metadata: Metadata = withShare({
  title: 'Legal',
  description: 'SlidesDone legal documents: Terms of Service, Privacy Policy, Cookie notice, and the cancellation and refund policy.',
  alternates: { canonical: '/legal' },
})

const ABOUT: Record<string, string> = {
  '/terms': 'The rules for using SlidesDone: accounts, plans and credits, your content and AI output, acceptable use.',
  '/privacy': 'What data we collect, how AI providers and others receive it, how long we keep it, and how to export or delete it.',
  '/cookies': 'The cookies and browser storage we use, and how to accept or refuse analytics.',
  '/refunds': 'How to cancel, when you can get a refund, and how long it takes.',
}

export default function Page() {
  return (
    <LegalPage path="/legal" title="Legal" intro="The documents that govern your use of SlidesDone, in one place.">
      <ul>
        {LEGAL_PAGES.map((p) => <li key={p.href}><Link href={p.href}>{p.label}</Link>: {ABOUT[p.href]}</li>)}
      </ul>
      <h2 id="who">Who we are</h2>
      <p><Operator />. GSTIN: <Owner k="gstin" />.</p>
      <h2 id="contact">Contact</h2>
      <p>Support: <SupportMail /> or the <Link href="/support">support form</Link>. Privacy and data requests: <Owner k="dataProtectionEmail" />. Grievance Officer: <Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" />.</p>
    </LegalPage>
  )
}
