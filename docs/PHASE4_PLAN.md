# Phase 4 — Templates, AI images, sharing, rich editing, owner intelligence

## Decisions from you → what changes
| You said | Applied as |
|---|---|
| Credits per slide fixed by model tier (2 / 5 / 12) | unchanged |
| Starter may use AI (generate **and** edit) on its 100 credits; still no export, watermark stays | `aiEdits=true` for Starter. Export gate + watermark unchanged. |
| Re-balance plans/models for profit | `docs/PRICING_MODEL.md` (margin tables). Opus-class models ($5/$25) moved from Pro→Gold tier: at 5 credits/slide they lose money on India Pro. Pro keeps Haiku 4.5 / Sonnet 4.6 / GLM-5.2 / Gemini 3.6 Flash. One row to flip back. |
| India ₹499 (Pro) / ₹1,200 (Gold) per month; abroad $15 / $30 | monthly prices as stated; annual = monthly × 12 × 0.80 (20% off): Pro $144/yr · ₹4,790/yr; Gold $288/yr · ₹11,520/yr |
| Owner email rupebhimani109@gmail.com | `make-admin` (script). **No auto-admin by email**: with unverified email signup, anyone could register that address first and become owner. Google sign-in (verified email) is safe → `ADMIN_EMAILS` only promotes **verified** accounts. |
| OpenRouter key later | stays unverified-live |

## Template categories (the PDF has no explicit list — derived from its use-cases and screenshots; tell me to change)
1 Pitch & Investors · 2 Sales & Proposals · 3 Marketing & Campaigns · 4 Business & Strategy · 5 Product & Roadmap · 6 Technology & Architecture · 7 Reports & Analytics · 8 Education & Training · 9 Case Studies & Consulting · 10 Team & HR → **12 templates each = 120**. Each = its own visual identity (palette, font pair, title/header/card/decor styles, background, motion) + a category-specific slide sequence with realistic placeholder copy.

## Tasks (each verified before the next)
| # | Task | Done when |
|---|---|---|
| P0 | Pricing v2: plan/price/credit/model data migration, monthly+annual toggle on pricing page, margin model doc | tests + pricing page shows ₹/$ monthly & annual |
| T1 | `packages/ui`: shared slide renderer (editor + website + share viewer) | editor still passes its E2E |
| T2 | Design-system v2: theme `style` kit (title/header/card/decor/footer variants, gradients), slide transitions, element entrance animations; engine renders them | every variant × aspect ratio × layout: 0 overflow/contrast errors |
| T3 | New layouts: roadmap, architecture, case-study, agenda, team, matrix (2×2/SWOT), big-number | schema + engine + prompts + tests |
| T4 | Template catalogue: 120 templates, uniqueness + quality tests | all compose clean on 16:9/4:3/1:1; unique ids/names/palettes |
| T5 | Template UX: gallery, "use template", apply to existing deck (Style → Templates), AI generation in a chosen design; website `/templates` + detail pages (real, unique copy); sitemap fixed | browser E2E |
| T6 | Animation runtime: present/share transitions + staggered entrances, editor preview, reduced-motion respected | E2E |
| I1 | Image generation backend: provider `generateImage` (Vertex/OpenRouter), asset storage (local + S3 impl), per-deck + per-month limits, credits, feature flag, ledger | tests + real image generated |
| I2 | Image UX: "AI image" dialog (user-described prompt + style), regenerate, generation-time images with a visual budget | E2E on real model |
| R1 | Rich text: bold/italic/link on a **selection**; links in present/share | tests + E2E |
| R2 | Drag-to-select (marquee), multi-select align/distribute | E2E |
| S1 | Share links: view (all plans) / edit (Pro+, requires login → collaborator), password + expiry (Pro+), revoke, members, public viewer | security tests + E2E |
| O1 | Owner: payments table, analytics events, feature flags, alerts + sections: Sales, Subscriptions, Cost & margin, Presentations, Exports, Prompts/use-cases, Performance, Providers, Images, Audit logs, Feature flags | numbers reconcile with raw tables |
| V | Docs, ADRs, skills, full verification | typecheck/lint/test/build + E2E green |

Out of scope (later): real payments/webhooks (needs Razorpay/Stripe keys), PPTX/PDF/PNG/JPG/HTML export rendering, live OpenRouter verification, brand kit internals.
