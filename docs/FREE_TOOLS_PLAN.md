# Free tools — acquisition plan

Goal: bring in search traffic with small free tools whose natural next step is "make this a designed deck in promptToPpt".
Principle: every tool ends in the same call to action — the result (outline, summary, PDF) is carried into the editor through the
existing anonymous **draft** hand-off, so the visitor never starts over.

## Status

| Phase | Tool | Status | Cost to us |
|---|---|---|---|
| 1 | AI Presentation Outline Generator — `/free-tools/presentation-outline-generator` | **built** | one cheap model call (Flash-Lite), ~₹0.05 |
| 1 | PDF → Presentation (AI) — `/free-tools/pdf-to-presentation` | **built** (modes: presentation, summary, executive, academic, business) | one call on ≤30k characters |
| 1b | **PDF → PPT converter, in the browser** — `/free-tools/pdf-to-ppt` (exact-look or editable-text; nothing uploaded unless the visitor clicks "Redesign it with AI") | **built** | none (runs on the visitor's device) |
| 1b | **Free template landing pages** — `/free-templates/<collection>` (e.g. `pitch-deck-templates`, `sales-presentation-templates`) (10 collections over the 120 templates) | **built** | none (static) |
| 1c | Programmatic outline pages `/presentation-outline/<use-case>` | planned (static copy, no AI cost) | none |
| 2 | Compress PDF / Compress PowerPoint | planned — do it **in the browser** (no server cost, files never leave the device) | none |
| 2 | Presentation Template Generator | planned — reuse the existing template/theme engine, no model call needed for the layouts | none / tiny |
| 3 | YouTube / Article / Website → PPT | planned — website already ingests URLs; YouTube needs a transcript source | one larger call |
| 3 | "Convert PDF to editable PowerPoint" (literal, option 1 of the brief) | planned — needs page rendering; separate from the AI path | CPU only |

## How a visitor is carried into the product

`result → POST /api/v1/drafts {prompt, attachmentIds} → editor /start?draft=<id>` (the draft is single use and claimed after sign-up/login).
For PDFs the file is parsed once, kept for one hour as a draft attachment, and handed over, so the editor does not need a second upload.

## Cost protection (these endpoints are public, anonymous and paid by us)

1. **Burst**: 6 requests/minute per IP across the tools.
2. **Per visitor per day**: `FREE_TOOLS_IP_DAY` (default 20) model calls per IP.
3. **All free tools together**: `FREE_TOOLS_USD_DAY` (default **$3** in any rolling 24h, read from the usage ledger, request types `free_*`). Past it the tools answer "busy"; signed-in customers are unaffected.
4. The app-wide AI circuit breaker (`AI_BUDGET_USD_*`) also pauses them.
5. Inputs are small: topic ≤ 300 characters, PDF ≤ 5 MB, ≤ 30k characters sent to the model, output token caps, no thinking budget.
6. The model is told the visitor text is data, never instructions (same wrapper rules as the main product).

Not yet in place (do before real traffic): Cloudflare Turnstile on the tool forms (the server helper exists — `verifyTurnstile`),
a shared rate-limit store when the API runs on more than one instance (the per-IP counters are in memory).

## Measuring it

The owner dashboard (Cloud → Cost per action) has a **Free tools** row: what visitors cost us. Conversion = draft claimed after sign-up ÷ tool runs;
the `drafts` table already records unclaimed vs claimed drafts. Add a `source` column to `prompt_draft` (e.g. `free-tool:outline`) so conversion can be split by tool
before turning on paid acquisition.

## SEO notes

- Distinct title, H1 and copy per URL. `/free-tools/pdf-to-ppt` is the literal browser converter; `/free-tools/pdf-to-presentation` is the AI summary-and-outline tool — different tools for different searches.
- FAQ markup (`FAQPage` JSON-LD) on every tool page; all pages are in the sitemap.
- Do not publish thin duplicates (the brief's five PDF-to-PPT URLs): two strong pages beat five copies.
- Do not try to out-rank iLovePDF on generic PDF utilities; compete on "document → presentation".

## Zero-cost shortlist (approved order)

Research summary: generic PDF utilities (merge/compress/image-to-PDF) have the biggest volumes but are unwinnable and do not convert; competitors
(SlideSpeak, Presentations.ai, Wonderslide, pptcompressor.online) prove PowerPoint-specific free tools can rank. Exact monthly volumes for the
PPT-specific keywords could not be verified from public pages — confirm in Google Keyword Planner before investing more.

1. PDF → PPT (browser) — built · 2. Template landing pages — built · 3. Outline pages · 4. Compress PowerPoint (browser) · 5. Topic ideas ·
6. Palette / font pickers · 7. Slides-and-time calculator · 8. PPT → text extractor.
