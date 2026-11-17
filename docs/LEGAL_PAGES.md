# Legal pages (Terms, Privacy, Cookies, Refunds)

Built 2026-11-17. Routes: `/terms`, `/privacy`, `/cookies`, `/refunds`, `/legal` (index). Code: `apps/web/app/(legal)/*`, `apps/web/components/legal/*`, owner config `apps/web/lib/legal.ts`.

**IMPORTANT: these texts are a drafted baseline written by an AI assistant, not by a lawyer. A lawyer qualified in Indian law (and, because customers are worldwide, ideally one who knows EU/UK/US consumer and privacy rules) must review them before launch. Nothing here is legal advice. This note is deliberately NOT on the public pages.**

## Owner config: `apps/web/lib/legal.ts`
Every field that is `'TODO'` shows on the page as a yellow `[Owner to add: …]` mark, and blocks a release (below).

| Field | What to put |
|---|---|
| `entityName` | legal name of the company / proprietorship (as on GST and Razorpay) |
| `registeredAddress` | registered office, one line |
| `gstin` | GST number |
| `grievanceOfficerName`, `grievanceOfficerEmail` | Grievance Officer (IT Rules, E-Commerce Rules, DPDP Act) |
| `dataProtectionEmail` | where deletion / export / privacy requests go (may equal support) |
| `governingLawCity` | city whose courts have jurisdiction, e.g. "Mumbai, Maharashtra" |
| `effectiveDate` | YYYY-MM-DD |
| `refundPolicyConfirmed` | date you confirmed the refund rules in section "Policy decisions" below |
| `aiNoTrainingConfirmed` | date you checked every production AI provider's paid / no-training terms; the privacy page states that claim next to this mark until filled |

Defaults already set (policy decisions, change in the same file): `supportEmail` (env `NEXT_PUBLIC_SUPPORT_EMAIL` or support@slidesdone.app), `refundWindowDays` 7, `refundMaxCreditsUsedPercent` 20, `dataRequestDays` 30, `grievanceAcknowledgeHours` 48, `grievanceResolveDays` 30, `minimumAge` 18.

## The release guard
* `assertLegalReady()` runs when every legal page renders: a **production build** (`APP_ENV` or `NEXT_PUBLIC_APP_ENV` = `production`) or `RELEASE_CHECK=1` **fails** while any owner field is TODO. Development passes. (`NODE_ENV` is not used: `next build` always sets it.)
* `node --experimental-strip-types scripts/check-legal.mjs`: the same check as a command (CI / pre-deploy). `RELEASE_CHECK=1 node ... ` must exit 0 before launch.
* Unit tests: `pnpm test:legal` (8 tests); the release check as a command: `RELEASE_CHECK=1 pnpm check:legal`. Both are wired: CI (`ci.yml`, manual) runs the tests always and the release check when started with "release" ticked; the *Deploy (production)* workflow runs the release check first when "release" is ticked; `RELEASE=1 infra/prod/deploy.sh web` and the web Dockerfile (`--build-arg APP_ENV=production --build-arg RELEASE_CHECK=1`) make the website image build fail while a field is TODO. **Proven with real image builds on 2026-11-17** (fails in 0.3 s with the 10 fields listed; `next build` itself also fails when the explicit step is skipped; passes with every field filled), see `DEPLOYMENT.md` "Legal release guard".
* Suite `e2e/suites/71-legal-pages.mjs` (24 checks): headings, canonical/no noindex, axe, phone width, footer links, sign-up consent line, pricing note, sitemap + llms.txt, visible owner marks, no analytics before consent.

## What is wired where
Footer "Trust & Privacy" column (4 links); sign-up form consent line (`AuthForm`, signup mode only, covers the Google/Microsoft buttons too); pricing section note and editor Billing page note (renews automatically, no rollover, links to /refunds and /terms); sitemap; `/llms.txt`; consent banner (`CookieConsent`, in `app/layout.tsx`). The editor has no sign-up form of its own (sign-up lives on the website).

**Analytics change:** the Google Analytics snippet used to load for every visitor on the real site. It now loads only after "Accept analytics" (opt-in, stored as `sd-consent` in localStorage), and is revoked with cookie removal + reload. Expect lower analytics numbers. The banner only exists when `NEXT_PUBLIC_GA_ID`/the real site URL turns GA on, so it is not visible in local development (not browser-tested with GA on; logic reviewed only).

## Statement -> fact map (re-check when the product changes)
| Statement on the pages | Fact / where |
|---|---|
| Credits do not roll over; upgrade resets balance to the new plan's allowance | `docs/BILLING.md` step 5 |
| Plans renew automatically via Razorpay; cancel keeps access to period end; failing renewals (`halted`) end access; switching plan cancels the old subscription at once, no proration | BILLING.md "Rules enforced in code" |
| Full refund ends the plan and removes credits; partial refund leaves the plan | `docs/EMAILS.md` ("Refund processed", "partial refunds (the plan stays)"), `revokeForPayment` |
| No card details stored; INR/USD chosen from visitor country | BILLING.md flow step 1, Razorpay Checkout |
| India prices GST-inclusive | `docs/PRICING_MODEL.md`, PLANS_AND_FEATURES_V5 section 4 |
| Limits: decks/month, slides, images, Morph decks/month, export formats | PLANS_AND_FEATURES_V5 sections 1, 9, Morph table |
| Draft/anonymous attachments live about 1 hour | `routes/drafts.ts` (`purgeExpiredDrafts`), checklist section 8 |
| Sources stored as text; uploaded bytes parsed and discarded; big media only while processing; pictures for image-to-deck not stored | `routes/sources.ts:129`, `media/store.ts`, checklist lines on image/video to deck |
| Share-link stats: no IP, no UA text, no cookie, random id in localStorage hashed per deck, country/device/referrer host, DNT/GPC honoured, 400 days, owner can clear | `routes/share-analytics.ts`, `apps/editor/src/lib/shareTracking.ts` |
| IP kept for rate limits, sign-in attempts, session record, audit log, support messages | `schema.ts` tables `session`, `auth_attempt`, `audit_log`, support message `ip` |
| Backups: WAL-G 14 days, snapshots, encrypted export every ~2 days kept ~30 days; assets bucket versioned 30 days | `docs/BACKUP_AND_RESTORE.md` |
| Sub-processors: AWS Mumbai, Gemini, OpenRouter (+ model makers), Razorpay, Brevo, Unsplash/Pexels, Google Analytics (consent), Google Fonts (editor), Google Translate (non-English), Google/Microsoft sign-in (only if enabled by env flags), Turnstile (only if site key set) | `services/api/src/env.ts` keys, `apps/editor/index.html`, `SiteTranslate`, `lib/env.ts`, `docs/AWS_ARCHITECTURE.md`, `docs/EMAILS.md` |
| Only service e-mails are sent (no marketing) | `docs/EMAILS.md` table |
| Session cookie ~30 days, HTTP-only, shared across sub-domains | `auth.ts` (`crossSubDomainCookies`), SECURITY_PLAN "session lifetime 30 days" |
| Share link password / collaborators / sharing | `routes/sharing.ts` |
| We do not train on content | no training code in repo (true for us); the **provider** side is an owner confirmation (`aiNoTrainingConfirmed`) |

## Things the pages say that the PRODUCT does not fully do yet (owner / dev decisions)
1. **No self-service account deletion or data export exists** (grep of `services/api` and both apps found none). The Privacy Policy therefore promises *email request, done within `dataRequestDays` (30)*. Someone must be able to do that by hand (delete a user and cascade, export a user's data) or a feature must be built. Recommended: build both before launch (DPDP Act / GDPR expect a workable path).
2. **Deleting a deck is a soft delete** (`presentation.deletedAt`), nothing purges it. The policy says "removed from your account at once; permanently erased when you ask us to delete your account or the deck". If you want automatic hard-delete after N days, build it and update the retention table.
3. Retention of `auth_attempt`, `audit_log`, logs is not defined in code; the policy says "as long as needed to keep the service safe". Decide real periods.
4. Uploaded **support attachments** are kept in storage under the support message; no deletion path is stated.
5. Razorpay "Refund processed" email exists but there is **no refunds UI**; refunds are issued by the owner in the Razorpay dashboard on request (BILLING.md "Not built yet").
6. **No GST invoices** yet (BILLING.md). Indian customers will expect them; the pages do not promise any.
7. Brevo is assumed as the e-mail provider (docs say chosen; code also supports Resend). Update the sub-processor table if that changes. Turnstile and Google/Microsoft rows appear only when their env flags are set at build time.

## Policy decisions to confirm (then set `refundPolicyConfirmed`)
Not decided by the owner anywhere in the docs; the baseline is the competitor-aligned suggestion in `docs/PRICING_PLANS_V4.md` line 92:
* Full refund within 7 days of the **first** payment if <= 20% of that payment's credits were used; one per customer.
* Renewals and later payments not refunded; yearly plans not pro-rated; double/incorrect/after-cancel charges refunded in full; serious service faults handled case by case.
* Refund time wording: reply within 2 working days; Razorpay refunds normally reach the customer in 5-7 working days (banks can take up to 10) per Razorpay's refund documentation.
* Other baseline choices a lawyer should look at: liability cap (12 months of fees or INR 1,000 on free), minimum age 18, governing law India with the owner's city courts, grievance times (acknowledge 48 h, resolve 30 days, the Consumer Protection (E-Commerce) Rules 2020 figures), "data fiduciary" wording, DPDP/GDPR rights wording, international transfer wording, acceptable-use list, the right to close long-unused accounts after warning, USD pricing/tax wording for non-India customers.
