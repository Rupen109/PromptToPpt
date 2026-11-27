import type { Metadata } from 'next'
import { withShare } from '@/lib/seo'
import Link from 'next/link'
import { LegalPage, Owner, SupportMail } from '@/components/legal/LegalPage'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = withShare({
  title: 'Cancellation and refund policy',
  description: 'How to cancel a SlidesDone plan, when you can get a refund, how to ask for one, how long it takes, and what happens to your plan and credits.',
  alternates: { canonical: '/refunds' },
})

/**
 * The refund and cancellation rules (owner-confirmed 2026-11-27, lib/legal.ts refundPolicyConfirmed): a new paid plan is refundable for
 * LEGAL.refundWindowDays days if at most LEGAL.refundMaxCreditsUsedPercent % of its credits are used; a credit top-up for the same days if none
 * of its credits are used. Laid out section by section the way payment providers (Razorpay) review it: eligibility, how to ask, the process and
 * timeline, notes, the free plan, and contact details.
 */
export default function Page() {
  const days = LEGAL.refundWindowDays
  return (
    <LegalPage path="/refunds" title="Cancellation and refund policy" intro={`We want you to be happy with SlidesDone. Every new paid plan comes with a ${days}-day refund window, and you can cancel any time.`}>
      <h2 id="eligibility">1. Refund eligibility</h2>
      <ul>
        <li><strong>New paid plans:</strong> you can ask for a <strong>full refund within {days} calendar days of your first payment</strong> for a paid plan (Pro, Gold or Premium, monthly or yearly), as long as you have used <strong>no more than {LEGAL.refundMaxCreditsUsedPercent}% of the credits</strong> that payment gave you.</li>
        <li>This applies to the <strong>first purchase of each plan</strong> only.</li>
        <li><strong>Not refundable:</strong> renewal payments, payments made after the first {days} days, the unused part of a month or year you have already started, and credits that have been used.</li>
        <li><strong>Credit top-ups:</strong> a top-up (a one-off purchase of extra credits) can be refunded in full within {days} calendar days of buying it, if <strong>none</strong> of its credits have been used.</li>
        <li><strong>Our mistakes are always refunded:</strong> if you were charged twice, charged an amount different from the price shown to you, or charged after you cancelled in time, we refund the extra amount in full, whenever it happened.</li>
      </ul>

      <h2 id="cancel">2. Cancelling your plan</h2>
      <ul>
        <li>Paid plans renew automatically each month or year. You can cancel the renewal at any time from <strong>Plan and billing</strong> in the editor. There is no cancellation fee.</li>
        <li>After you cancel, you keep your plan and its features until the end of the period you already paid for. Your account then moves to the Free plan and is not charged again.</li>
        <li>Cancel before your renewal date to avoid the next charge. A renewal that has already been charged is not refunded because cancelling was forgotten.</li>
        <li>Switching to a different paid plan ends the old subscription at once and starts the new one; the unused part of the old plan is not credited.</li>
      </ul>

      <h2 id="request">3. How to ask for a refund</h2>
      <ul>
        <li>E-mail <SupportMail /> (or use the <Link href="/support">contact form</Link>) <strong>within {days} days</strong> of the payment.</li>
        <li>Write from the e-mail address of your SlidesDone account, and include that address, the date of the payment and, if you like, the reason (it helps us improve).</li>
        <li>We reply to every refund request <strong>within 2 working days</strong>.</li>
      </ul>

      <h2 id="process">4. How refunds are paid</h2>
      <ul>
        <li>Approved refunds are sent through our payment provider, <strong>Razorpay</strong>, back to the <strong>original payment method</strong> (card, UPI or net banking). We never refund to a different account.</li>
        <li>Banks and card networks usually take <strong>5 to 7 working days</strong> to show the refund on your statement, and some take up to 10 (UPI is often faster). Any tax charged on the payment is refunded with it.</li>
        <li>When a plan payment is refunded, the plan ends and your account moves to the Free plan; the unused credits that payment gave you are removed. When a top-up is refunded, only its credits are removed — your plan stays.</li>
        <li><strong>Your presentations stay yours:</strong> after a refund they remain in your account on the Free plan, ready for you if you subscribe again.</li>
      </ul>

      <h2 id="notes">5. Important notes</h2>
      <ul>
        <li>We may refuse a refund where we see abuse or fraud, for example repeated sign-ups to use a plan and then refund it, or credits used heavily before asking.</li>
        <li>The credits of a plan belong to the billing period they were granted for: unused credits do not roll over and have no cash value. Credits bought as a top-up do not expire at the end of a period and stay until you use them.</li>
        <li>Please write to us before raising a dispute (chargeback) with your bank — we can usually solve it faster. While a dispute is looked into, the plan that payment bought may be paused or ended.</li>
        <li>If a serious fault on our side stops you from using what you paid for, write to us and we will make it right, which may include a refund.</li>
        <li>Accounts closed for breaking our <Link href="/terms">Terms</Link> are not refunded. Your rights under consumer law that cannot be waived are not affected by this policy.</li>
      </ul>

      <h2 id="free">6. Try it first on the Free plan</h2>
      <p>Every account starts on a <strong>Free plan</strong> with monthly credits, so you can try making presentations before you pay. We encourage you to use it to check that SlidesDone suits you; the free plan has nothing to refund.</p>

      <h2 id="contact">7. Contact us</h2>
      <p>Questions about this policy, or a refund request: <SupportMail />, phone <Owner k="phone" />, or the <Link href="/support">contact form</Link>. SlidesDone is run by <Owner k="entityName" />, <Owner k="registeredAddress" />. Complaints: our Grievance Officer <Owner k="grievanceOfficerName" />, <Owner k="grievanceOfficerEmail" />.</p>
      <p className="text-sm">These rules were last confirmed on <Owner k="refundPolicyConfirmed" />.</p>
    </LegalPage>
  )
}
