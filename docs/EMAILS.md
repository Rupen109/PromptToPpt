# E-mails SlidesDone sends

One design (`services/api/src/lib/email-templates.ts`): a brand bar, a white card with a cobalt top edge, one clear button, a plain-text copy of every mail, and a quiet footer. Tables with inline styles at 560 px. The only picture is the real SlidesDone logo (`apps/web/public/logo-lockup.png`, shown 200 px wide) with the name as alt text, so a mail app that blocks images still shows a readable mail. See them all with sample data: `pnpm --filter @prompttoppt/api email:preview` (writes `services/api/.data/email-preview/index.html`).

| Email | When it is sent | Code |
|---|---|---|
| Confirm your email | sign-up (production requires confirmation) | `auth.ts` `sendVerificationEmail` |
| Welcome | after the address is confirmed, or at once for a Google sign-up | `auth.ts` `afterEmailVerification` / `user.create.after` |
| Reset your password | "Forgot password?" → `/forgot-password` | `auth.ts` `sendResetPassword` |
| Your password was changed | after a reset (everyone is signed out) | `auth.ts` `onPasswordReset` |
| Invited to edit | owner invites a collaborator (Pro / Gold) | `routes/sharing.ts` |
| Mentioned in a comment | a comment mentions someone (max one per deck every ten minutes) | `routes/comments.ts` |
| A presentation for you | owner uses "Email this link" | `routes/sharing.ts` |
| Payment received (receipt) | a payment is captured, once per payment | `billing/subscriptions.ts` `recordPayment` |
| Payment did not go through | a payment fails, once per payment | same |
| Plan will not renew | owner cancels renewal | `cancelAtPeriodEnd` |
| Refund processed | a full refund (the plan ends, credits are removed) | `revokeForPayment` |

Not e-mailed on purpose: support messages (they land in the owner dashboard), disputes (handled by the owner), partial refunds (the plan stays).

## Rules the code enforces (tests: `email-templates.test.ts`, `mailer.test.ts`, `payments.test.ts`)
* Everything a person typed (names, deck titles, messages, comment text) is escaped in the HTML; links are http(s) only; subjects are one line, no emoji.
* Billing mails go out exactly once per payment even when the checkout confirmation and the webhook report it together, and they never delay or fail the payment (3 s cap, errors swallowed).
* Mail to reserved test domains (`example.com/.net/.org`, `.test`, `.invalid`, `.localhost`) and everything the test suite sends is **never** handed to Brevo/Resend; it stays in the outbox (and, in development, in `services/api/.data/outbox.jsonl`, git-ignored, which the browser tests read).
* Provider: Brevo (`BREVO_API_KEY`) or Resend (`RESEND_API_KEY`) with `EMAIL_FROM`; see `docs/COLLABORATION.md`.

## Pages that go with them
`/forgot-password` (asks for the address; the answer never says whether an account exists; rate-limited) and `/reset-password` (arrives from the e-mail with a one-time token; old, used or invented links say "This link no longer works" and offer a new one). Proof: `e2e/suites/46-emails-and-password-reset.mjs`.

## The logo
Mail apps load the logo from a **public web address** (a picture cannot travel inside the mail reliably). It defaults to `<WEB_URL>/logo-lockup.png`, so it appears as soon as the website is online on its real domain. While the website only runs on a computer (localhost or a private address) the mail shows a lettered tile instead of a broken picture. To show the logo before launch, set `EMAIL_LOGO_URL` to any public address of that PNG (for development it points at the file in the public GitHub repository); to change the logo, replace `apps/web/public/logo-lockup.png`.
