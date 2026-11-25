import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import Link from 'next/link'
import { LegalPage, Owner, SupportMail } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = withShare({
  title: 'Cancellation and refund policy',
  description: 'How to cancel a SlidesDone plan, when you can get a refund, how long refunds take, and what happens to your credits and access.',
  alternates: { canonical: '/refunds' },
})

export default function Page() {
  return (
    <LegalPage path="/refunds" title="Cancellation and refund policy" intro="Cancel any time and keep your plan until the end of the period you paid for. New customers can ask for a refund in the first days.">
      <h2 id="cancel">1. Cancelling</h2>
      <ul>
        <li>Paid plans renew automatically each month or year. Cancel the renewal at any time from the billing page of the editor (Plan and billing). There is no cancellation fee.</li>
        <li>After you cancel, you keep your plan and its features until the end of the period you already paid for. It then moves to the free plan and is not charged again.</li>
        <li>Cancel before the renewal date to avoid the next charge. We do not refund a renewal that has already been charged because you forgot to cancel, except as in section 3.</li>
      </ul>

      <h2 id="first">2. Refund on your first payment</h2>
      <p>If you subscribe to a paid plan for the first time, you can ask for a <strong>full refund within {LEGAL.refundWindowDays} days of that first payment</strong>, provided you have used no more than <strong>{LEGAL.refundMaxCreditsUsedPercent}% of the credits</strong> that payment gave you. This applies to monthly and yearly plans, and to one first-time refund per customer.</p>
      <p>To ask, write to <SupportMail /> from your account e-mail address within that time, with the e-mail address and the payment date.</p>

      <h2 id="other">3. Other refunds</h2>
      <ul>
        <li><strong>Mistakes on our side.</strong> If you were charged twice for the same period, charged an amount that is not the price shown to you, or charged after you cancelled in time, we refund the extra amount in full.</li>
        <li><strong>Renewals and later payments.</strong> Renewals, and payments after the first {LEGAL.refundWindowDays} days, are not refunded for the time already started, including part-used months or years. If you cancel a yearly plan part-way, it runs to the end of the year and is not refunded pro rata.</li>
        <li><strong>Changing plan.</strong> When you switch from one paid plan to another, the old subscription ends at once and the new one starts. We do not yet give credit for the unused part of the old plan.</li>
        <li><strong>Service problems.</strong> If a serious fault on our side stops you using what you paid for for a long time, write to us and we will make it right, which may include a refund.</li>
        <li><strong>Not refundable.</strong> Credits already used, accounts closed for breaking the <Link href="/terms">Terms</Link>, and the free plan (which has nothing to refund).</li>
        <li>Your rights under consumer law that cannot be waived are not affected.</li>
      </ul>

      <h2 id="effect">4. What happens to your plan and credits after a refund</h2>
      <p>When a payment is refunded in full, the paid plan it bought ends and its unused credits are removed. A partial refund leaves the plan in place. Your presentations stay in your account on the free plan.</p>

      <h2 id="credits">5. Credits do not roll over</h2>
      <p>The credits of a plan belong to the billing period they were granted for. Unused credits are not carried forward, are not exchangeable for money and are not refunded.</p>

      <h2 id="time">6. How long a refund takes</h2>
      <p>We reply to refund requests within 2 working days. An approved refund is sent through our payment provider Razorpay to the payment method you used. Banks and card networks usually take <strong>5 to 7 working days</strong> to show it, and some take up to 10 (UPI is often faster). Any tax charged on the payment is refunded with it. If the refund has not arrived after that time, contact your bank with the refund reference we give you, and write to us if it is still missing.</p>

      <h2 id="disputes">7. Payment disputes</h2>
      <p>Please write to us before raising a dispute (chargeback) with your bank; we can usually solve it faster. If a dispute is raised, the plan that payment bought may be paused or ended while it is looked into.</p>

      <h2 id="contact">8. Contact</h2>
      <p>Refund requests and questions: <SupportMail /> or the <Link href="/support">support form</Link>. Complaints: Grievance Officer <Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" />. Refund rules last confirmed: <Owner k="refundPolicyConfirmed" />.</p>
    </LegalPage>
  )
}
