# Plans and features v5 (the owner's spec, 2026-11-03)

Status (2026-11-03): **built on the server and in the editor/web UI** (plans, prices, credits, gates, migration 0037, tests: API 929 pass). Decisions are in section 9; what is deferred is in section 10.
Supersedes `docs/PRICING_PLANS_V4.md`.

---

## 1. The four plans (owner's definitions)

| | **Starter** (free, **not shown** on the pricing page) | **Pro** ₹300 / month | **Gold** ₹650 / month | **Premium** ₹1,200 / month |
|---|---|---|---|---|
| Credits | **100**, free | to decide (section 4) | to decide | to decide |
| Presentations | 4-5 (about 5), up to **10 slides** | **15** / month, up to **15 slides** | **50** / month, up to **25 slides** | **50** / month, **no slide limit** (credits limit it) |
| Models for decks | fixed: Gemini 2.5 or 3.6 | fixed: Gemini 3.6 or 3.8 | fixed: Gemini 3.6 or 3.8, high quality | **the person chooses** (OpenRouter list below) |
| Asks which model? | no | no | no | **yes** |
| Templates | (starter set) | all templates | all templates | all + **premium design systems and templates** |
| Editor, "edit with AI" | editor only (create from scratch, edit) | yes | yes | yes |
| Create from scratch | yes | yes | yes | yes |
| Live preview | **no** | yes | yes | yes |
| Export | **none**; asking to export shows the upgrade prompt | PDF, PPTX, JPEG, **Google Slides** | PDF, PPTX, PNG, JPEG, HTML | same as Gold |
| Watermark | **yes** | no | no | no |
| Assistant for slide creation | (generation only: "see how it generates") | 14+ languages | 14+ languages | 14+ languages |
| Clone Slide (image → editable PPT) | no | **10** / month | **20** / month | (decide, proposal 40) |
| Support / speed | standard | fast | ultra | ultra |

Starter in plain words (technical note, never shown to customers): a person can **make a deck and watch it being written**, can **open the editor and build or edit one from scratch**, but **cannot preview or present it**, and **export asks them to upgrade**. The watermark stays on everything.

## 2. Premium models, checked against OpenRouter today (451 models listed)

| You listed | On OpenRouter | Price (in / out per million tokens) | Note |
|---|---|---|---|
| Sonnet 4.6 | `anthropic/claude-sonnet-4.6` | $3 / $15 | ok |
| Opus 4.8 | `anthropic/claude-opus-4.8` | $5 / $25 | ok |
| Opus 4.6 | `anthropic/claude-opus-4.6` | $5 / $25 | ok |
| Haiku 4.5 | `anthropic/claude-haiku-4.5` | $1 / $5 | ok |
| GLM-5.2 | `z-ai/glm-5.2` | $0.01 / $6.80 | the $0.01 input price looks wrong or promotional: confirm before trusting |
| Nano Banana Pro | `google/gemini-3-pro-image` | $2 / $12 (image) | ok |
| Nano Banana 2 | `google/gemini-3.1-flash-image` | $0.50 / $3 (image) | ok |
| GPT Image 2 | `openai/gpt-5.4-image-2` (closest) | $8 / $15 (image) | confirm this is the model you mean |
| **Opus 4.8 Fast** | **not on OpenRouter** | | cannot be offered through OpenRouter |
| **Ideogram v3** | **not on OpenRouter** | | needs another provider (for example fal.ai or Replicate) |

Also: `z-ai/glm-5.3-flash` is $0.03 / $0.09 live, our catalogue still says $0.15 / $0.50 (`pnpm catalog:sync` refreshes it).

## 3. What each feature means for the code

| Feature | Today | Change needed | Size |
|---|---|---|---|
| Plan limits: decks per month, slides per deck, watermark | exist (`maxPresentationsPerMonth`, `maxSlides`, `watermark`) | new numbers (Starter 5 / 10, Pro 15 / 15, Gold 50 / 25, Premium 50 / unlimited) | small |
| Fourth plan, Premium | plans are `starter`, `pro`, `gold` | new plan id everywhere (plan table, prices, checkout, pricing page, plan names in the editor, Razorpay plan ids) | medium |
| Starter hidden from the pricing page | shown | hide it; keep it as the default plan of every new account | small |
| Fixed models for Starter / Pro / Gold, no picker | picker by tier | hide the picker; the plan decides the model; the model catalogue keeps tiers | medium |
| Premium: choose a model | picker exists | show the OpenRouter list above; add the missing catalogue rows; price each model in credits | medium |
| Export per plan | formats per plan exist | Starter none; Pro PDF, PPTX, JPEG, **Google Slides**; Gold and Premium PDF, PPTX, PNG, JPEG, HTML | small, **except Google Slides** |
| **Google Slides export** | does not exist | a real integration needs Google sign-in with Drive access (consent screen and Google's app verification take weeks); the simple route is "download the PPTX and open it in Google Slides" | **large or small, see question 2** |
| Live preview (present mode) | open to everyone | gate present mode and share view by plan (Starter: no) | small |
| AI edits per plan | on for every plan on credits | Starter off (the owner's list gives it to Pro and above) | small |
| Clone Slide (image → editable PPT), 10 / 20 a month | the closest is image-to-deck (reads text from a picture to build a deck); no monthly count | a monthly count per plan; **a true clone** (recreate layout, colours and shapes as editable elements) is a new feature | counts small, true clone **large** (question 3) |
| Assistant "14+ languages" | the picker has 43 | copy only | none |
| Credits and their prices | per tier (2 / 5 / 12 credits a slide) | re-priced per model (section 5) because the person no longer picks a tier | medium |

All limits are data (`plan`, `plan_price`, `credit_cost`) and every gate is enforced on the server; existing databases need a migration, because seeds never overwrite.

## 4. Money: what each plan earns and the credits it can safely hold

Net revenue = price ÷ 1.18 (GST included in the shown price, as in v4) after Razorpay's ~2.36 %, at ₹88 per $: **Pro $2.82, Gold $6.11, Premium $11.28 a month**.
Measured costs (the 1,500-user test): a deck is **$0.0144** (about $0.00144 a slide on the Gemini default mix), an assistant message about $0.001. Clone Slide is **not measured** (estimate $0.01-0.02 a clone). **Gemini 3.x Flash doubles in price on 2027-01-01**, which raises the cost of Flash work by about 75 %: the credits below are sized so the margin still holds then.

| Plan | Credits (proposal) | What they buy at 2 credits a slide | Worst-case cost today | Margin today | Worst-case cost from 2027-01-01 | Margin from 2027 |
|---|---|---|---|---|---|---|
| Starter | **100** | 5 decks of 10 slides (the owner's "4-5") | $0.07 | free (acquisition) | $0.13 | free |
| Pro | **900** | 15 decks × 15 slides = 450 credits, 450 left for edits and clones | $0.65 | **77 %** | $1.13 | **60 %** |
| Gold | **2,000** | 50 decks × 12 slides = 1,200, 800 left; 50 × 25 would need 2,500 | $1.44 | **76 %** | $2.52 | **59 %** |
| Premium | **3,700** | about 370 Sonnet slides or 217 Opus slides | $2.59 | **77 %** | $2.59 | **77 %** |

"Worst case" = the person spends every credit. Most people spend a fraction, so real margins are higher. These credit numbers are my proposal (the owner said "not sure about credit" for Pro); they are data and can change without a deploy.

## 5. Credits per slide, by model (Premium)
A slide costs about 800 input and 320 output tokens (measured). One credit is about $0.0007 of provider cost.

| Model | Cost a slide | Credits a slide |
|---|---|---|
| Gemini 3.6 / 3.8 Flash (Starter, Pro, Gold) | $0.0014 measured | **2** |
| Claude Haiku 4.5 | $0.0024 | 3 |
| GLM-5.2 | $0.0022 | 3 |
| Claude Sonnet 4.6 | $0.0072 | **10** |
| Claude Opus 4.6 / 4.8 | $0.0120 | **17** |

Image models (Nano Banana Pro $0.134 a picture, Nano Banana 2 $0.067, GPT Image 2 priced per token) are charged per picture in credits at the same rate. The writing step of an assistant edit uses the chosen model and costs credits the same way; the understanding step always runs on the cheapest model.

## 6. Load tests with Ollama (added 2026-11-03)
`AI_PROVIDER=ollama` serves the whole catalogue from Ollama cloud's `glm-5.3-flash` (priced at 0 because the Ollama plan is flat, so the cost numbers of a load test are not real bills). Development only; production refuses it. Check it with `cd services/api && npx tsx --env-file=.env scripts/ollama-check.ts`. Needs `OLLAMA_API_KEY` in `services/api/.env`.

## 7. Open questions (decisions for the owner)
1. **"Live preview" for Starter**: my reading is that Starter cannot use **present mode (full-screen slideshow) or share links**, but still sees the editor canvas. Is that what you mean?
2. **Google Slides export for Pro**: build the full Google integration (weeks because of Google's verification), or ship "download PPTX, open in Google Slides" now and the integration later?
3. **Clone Slide**: is it "turn a picture of a slide into a real editable slide" (new, large), or can the existing "image → deck" (reads the text from a picture) stand in for now? Premium count: proposal 40 a month.
4. **Credits**: accept the proposal (Pro 900, Gold 2,000, Premium 3,700, Starter 100), or give your own?
5. Defaults I will use unless told otherwise: Starter has **no AI edits and no AI pictures**; Opus 4.8 Fast and Ideogram v3 are **left out** (not on OpenRouter); GPT Image 2 is `openai/gpt-5.4-image-2` once you confirm; prices are monthly (yearly prices and the US-dollar prices still to decide).

## 8. Build order (after the answers)
1. Plan data: Premium plan, new limits, credits, per-model credit prices, the migration for existing databases, tests.
2. Gates: export formats per plan, present mode and share view for Starter, AI edits off for Starter, Clone Slide counts, model picker rules.
3. Pricing page and checkout: four plans (Starter hidden), Razorpay plan ids for Premium, upgrade prompts per feature.
4. Premium model catalogue rows and credit prices; image models.
5. Google Slides export and the true Clone Slide, as decided in questions 2 and 3.

## 9. Decisions (owner, 2026-11-03) and what was built
- **Live preview (Starter: no)** = no present mode and no share links (link creation and "email this link" are refused with `UPGRADE_REQUIRED`, feature `livePreview`); the editor canvas stays. A link made before a downgrade keeps working and shows the watermark.
- **Credits**: Starter 100, Pro 900, Gold 2,000, Premium 3,700.
- **Starter**: hidden from the pricing page (still every new account's plan), 5 decks a month, 10 slides, no AI edits, no AI pictures, no export, watermark. A template longer than the plan's slide limit is cut to the first slides instead of refused.
- **Models**: the plan decides (`fixedModels`: Starter Gemini 3.6 then 2.5, Pro and Gold Gemini 3.6 then 3.8); only Premium picks (`modelChoice`); `/models` returns `choice` and the editor shows no picker without it (the length button starts the build).
- **Prices**: INR monthly 300 / 650 / 1,200 (yearly = monthly x 12 x 0.8); **USD $10 / $19 / $35 and the yearly prices are provisional**. Razorpay: a changed price makes a NEW provider plan (`plan_price.provider_amount_minor`), so an old amount can never be charged; subscribers still on an old provider plan are ignored by `applySubscription` after a price change.
- Premium `maxSlides` is 60 (the system ceiling; credits are the real limit).
- Images: Pro 10 per deck / 60 a month, Gold and Premium 20 / 100. The route's own burst limit (10 a minute) is a separate guard.

## 10. Deferred (owner said: note it down, do later)
1. **Google Slides export** (Pro list). Not advertised anywhere. Options when it comes: full Google Drive integration (weeks of Google verification) or "download PPTX, open in Google Slides".
2. **Clone Slide** (Pro 10 / Gold 20 a month, picture to editable slide). Not advertised.
3. **Premium design systems / templates** as an extra set: does not exist yet (Premium has all templates).
4. Opus 4.8 Fast and Ideogram v3 (not on OpenRouter); GPT Image 2 mapping to confirm.
5. Remaining UI/e2e: e2e suites that mention old prices or plans (07, 48 and others) need updating; the browser AI suites wait for the Google key.


## Morph animation plan split and monthly limit (2026-11-09)
Replaces the single `animations` flag (migration 0043).

| | Starter | Pro | Gold | Premium |
|---|---|---|---|---|
| object animations (entrance, emphasis, exit), animation pane | yes | yes | yes | yes |
| basic slide transitions | yes | yes | yes | yes |
| Morph transitions, Morph templates, Morph editor tools (`features.morph`) | no | no | yes | yes |
| AI-built Morph decks a month (`features.morphDecksPerMonth`) | 0 | 0 | 10 | 30 |

Enforcement (server): adding or changing a Morph transition on save needs `morph` (`morphAdded`, so a later downgrade keeps old decks playing and lets Morph be removed); starting a Morph job needs `morph` and a free allowance (`assertMorph`, `assertMorphQuota`). The allowance is counted from `generation_job` rows (`options.morph`, failed and cancelled jobs do not count), and re-counted after the insert in a fixed order so parallel starts cannot overshoot.

**Why 10 and 30 (measured, not guessed).** A Morph deck is one planning call plus a tiny design pick: measured average $0.0058 on 11 real jobs on Gemini 3.6 Flash ($0.0077 at worst), less than half of a normal deck ($0.0127). On the dearest model a plan allows (Opus 4.8, Premium) about $0.037. Net revenue a month: Gold $6.11, Premium $11.28. At the limit: Gold 10 x $0.0058 = $0.058 (about 1% of net; 4% if every deck used the dearest Gold model), Premium 30 x $0.037 = $1.11 (about 10%, with every deck on Opus). Gemini Flash prices double on 2027-01-01: the same decks cost about twice that, still under 2% (Gold) on the default model. The limit is therefore a product limit, not a cost limit; change the two numbers in `seed.ts` (+ an UPDATE migration) to move them.

