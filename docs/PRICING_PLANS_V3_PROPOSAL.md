# Pricing plans v3 — proposal (benchmark: MagicSlides)

Status: **proposal. Update 2026-10-28: AskPPT, Wikipedia/web data, 100+ languages and the AI-pictures listing are built and live in dev (see docs/ASK_RESEARCH_LANG_FUNCTIONAL_FLOWS.md); integrations, clone slide, any-PPT-as-template and Google Slides export are still not built.** Source: magicslides.app/pricing read 2026-10-27. Our current plans: `services/api/src/billing/seed.ts`; margins: `docs/PRICING_MODEL.md`, `docs/PRICING_BURN_RESULTS.md`.

## 1. What MagicSlides sells (3 subscriptions + 1 service)
| | Essential | Pro | Premium ("most value") | Done By Us |
|---|---|---|---|---|
| Price / month (annual total) | $6.67 ($80/yr) | $12.42 ($149/yr) | $23.25 ($279/yr) | $99 once |
| Decks / month | 10 (≤10 slides) | 50 (≤15 slides) | 50 (50+ slides) | 1, built by a designer, 48–72 h |
| Clone slide (image → editable PPT) | 10 | 50 | counts as 1 deck | included |
| Export | PDF, PPTX, Google Slides | same | PPTX, PDF, PNG, JPG, HTML | all |
| AI pictures | add-on only | add-on only | premium image models | — |
| Models | default | default | Sonnet 4.6, Opus 4.8, Haiku, GLM, Nano Banana Pro, GPT Image 2… | — |
| Templates / design | use any PPT as template | same | 200+ templates, 150+ design systems, custom design systems | — |
| Extras | AskPPT (chat with deck), 100+ languages | same | secure share with password + analytics, Magic Sheets/Docs/Talks/Canvas, 24/7 WhatsApp | — |
| **Integrations & tools** | all 9 listed below | all 9 | not repeated on the page | — |

**No free plan** on their page (only a free API tier). We already have a free Starter, so that is a plus for us.

### Their Integrations & Tools (given to every paid plan, even the cheapest)
1. Google Slides add-on  2. Figma plugin  3. ChatGPT GPT  4. Chrome extension  5. Telegram bot  6. Zapier  7. **MCP server** (Claude/ChatGPT/Grok/any agent returns a designed deck with editor + PPTX + PDF links; listed in the Official MCP Registry)  8. Android app  9. iOS app.
They are an acquisition channel: each one puts the product inside a place where the user already works.

## 2. Where we stand today
| | Starter (free) | Pro ₹499 / $15 | Gold ₹1,200 / $30 |
|---|---|---|---|
| Credits / month | 100 | 3,000 | 10,000 |
| Slides per deck | 20 | 40 | 60 |
| Decks / month | unlimited (credit-bound) | 50 | unlimited |
| AI pictures / month | 6 | 60 | 100 |
| Export, no watermark | no | yes (5 formats) | yes |
| Models | starter | + premium | + frontier |
| Brand kit, knowledge base (sources) | no | no | yes |
| Support / speed | community | WhatsApp / fast | WhatsApp / ultra |

Already ahead of MagicSlides: free tier, brand kits, sources/knowledge base, live collaboration and comments, share analytics, remix, PDF→PPT free tool, 40–60 slides per deck on Pro/Gold (they give 15 on Pro).
**Missing versus them: every integration (zero of 9 built), clone slide (image → editable PPT), chat-with-deck, any-PPT-as-template, Google Slides export, API/MCP access.**

## 3. Proposed three tiers
Keep the three-tier shape (Starter / Pro / Gold) and use integrations as the ladder, because they cost almost nothing to serve and are the strongest reason to upgrade.

| | **Starter** (free) | **Pro** | **Gold** |
|---|---|---|---|
| Price | ₹0 / $0 | ₹499 / $15 (unchanged until the OpenRouter run) | ₹1,200 / $30 (India margin 34 % → review) |
| Credits | 100 | 3,000 | 10,000 |
| **Integrations & tools** | Chrome extension (view/open only), Telegram bot (3 decks/month) | **Chrome extension, Google Slides add-on, Figma plugin, ChatGPT GPT, Telegram bot, Zapier, mobile apps** (all use the plan's credits) | **everything in Pro + MCP server + public API key + webhooks, team workspace** |
| Clone slide (image → editable) | 1 / month | 30 / month | 100 / month |
| Chat with deck (AskPPT) | — | yes | yes |
| Any PPTX as template | — | yes | yes + custom design systems |
| Export | none | PPTX, PDF, PNG, JPG, HTML, **Google Slides** | same |
| Done-for-you | — | — | add-on, price per deck (see section 5) |

Rules that keep it safe: every integration call goes through the same API, the same credit ledger, the same daily AI cap and the same rate limits; keys are per user, revocable, hashed at rest; nothing is trusted from the client.

## 4. Integrations — what to build, in order
| # | Integration | Effort | Why / risk |
|---|---|---|---|
| 1 | **Public API + keys** | M | Foundation for 2, 3, 4, 6, 7. Per-key limits, credit charge, usage page. |
| 2 | **MCP server** | S after #1 | Cheapest high-value one; Claude/ChatGPT users find us; register in the MCP registry. |
| 3 | **Zapier** (triggers/actions on #1) | M | Needs Zapier app review (weeks). |
| 4 | **Chrome extension** (turn page/selection into deck) | M | Uses the "remix from URL" and sources work already built; store review. |
| 5 | **Google Slides export** | M | Google OAuth + Slides API; sensitive-scope verification takes time. |
| 6 | **ChatGPT GPT** | S after #1 | Custom GPT calling our API. |
| 7 | **Telegram bot** | S after #1 | Free to run. |
| 8 | **Figma plugin** | M | Smaller audience. |
| 9 | **Google Slides add-on, mobile apps** | L | Later; the editor already works in a phone browser. |
Cost note: integrations add little server cost except that API users generate more decks. That is why they sit behind credits and the per-user daily AI cap, and why MCP/API stay on Gold until measured.

## 5. Questions that change the numbers (owner decisions)
1. **Price changes:** Gold in India has only about 34 % margin with the AI-picture button; the no-AI-picture burn and the OpenRouter run should come before any price change.
2. **Credit-gated vs deck-capped:** MagicSlides sells "50 decks"; we sell credits. Keep credits (fairer, protects margin), but show "about N decks" next to each plan on the pricing page.
3. **A fourth offering "Done by us"** (human designer) is a service, not software; only add it if you have designers.
4. **Annual price:** their annual Pro ($149/yr) works out to $12.42 a month against a $16 list price, about 22 % off; ours is 20 % off. Keep.

## 6. Next steps once you approve
1. Edit `PLAN_SEED`/`features` (new flags: `integrations[]`, `cloneSlides`, `askDeck`, `apiAccess`, `mcp`) + migration + entitlement checks + pricing page and editor Billing page text.
2. Build #1 API keys, then #2 MCP, then the rest in order, one at a time, each with a flow list and real end-to-end run.
3. Update `docs/PRICING_MODEL.md` and the go-live checklist.
