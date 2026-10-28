# Launch plan — SlidesDone (draft 2026-10-28)

Source of truth for *what must be true* is `docs/PRODUCTION_RELEASE_CHECKLIST.md` (79 open items on 2026-10-28). This page puts them in an order and says who does what. The deployment shape changed after that checklist was written: **lean AWS setup on the Free plan** (one EC2 server with Docker Compose, small RDS, S3, CloudFront, no NAT gateway) instead of ECS Fargate + ALB; decision day ≈ day 45 (stay on AWS or move to a ~$5-10 fixed-price server).

## Order of work
1. **Decisions** (owner, this week): plans and prices (below), free-plan export policy, AI provider = OpenRouter (key), alert email, integrations order.
2. **Rename** promptToPpt → SlidesDone in the site, editor, emails, docs, e2e (me).
3. **Infrastructure as code** (OpenTofu) for the lean setup + budget alerts + deploy script; run the test environment end to end (me; needs the owner's AWS profile and alert email).
4. **Production hardening on the test environment** (me): AI budgets ($3/hour, $10/day to start), AI-provider billing alert, Turnstile, backups + restore drill, uptime/error alerts, rollback tried once, the attack/load/CTA suites re-run against it.
5. **Business items only the owner can do**, started now because they take calendar time: legal entity + GST + bank details; Razorpay KYC and live keys; Resend sending domain (SPF/DKIM/DMARC); Unsplash Production access; India/US trademark search for SlidesDone; Terms, Privacy, Refund pages (a lawyer should read them; I draft).
6. **Go-live** → marketing (Product Hunt, Reddit, directories, YouTube) and the SEO pages.

## Truth in advertising (must fix before any pricing page goes live)
- Gold "advanced brand customization" and "shared knowledge base" are **not built**: build or remove the promise.
- Free plan: today a watermark, **no export**, login needed. The most common searches ask for "without watermark / without login".
- Credits do not roll over: say so on the page and in checkout.

## Pricing — numbers behind the options
Measured on Vertex (dev), worst case = the customer spends the *whole* allowance, mix included AI pictures (docs/PRICING_BURN_RESULTS.md): Pro $2.07, Gold $7.45. Real customers use far less; OpenRouter is not measured yet. Net revenue after GST and gateway fees ≈ price × 0.8235 ÷ 88 USD.

| Plan (India, monthly) | Net per month | Worst-case margin |
|---|---|---|
| Pro ₹499 (today) | $4.67 | 56 % |
| Pro ₹599 | $5.61 | 63 % |
| Pro ₹699 | $6.54 | 68 % |
| Gold ₹1,200 (today) | $11.23 | **34 %** |
| Gold ₹1,499 | $14.03 | 47 % |
| Gold ₹1,999 | $18.71 | 60 % |
International $15 / $30 stay: worst-case margins 85 % / 74 %.
