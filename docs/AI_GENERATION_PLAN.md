# AI generation — behaviour plan (DRAFT for approval)

Status (2026-10-03): decisions approved as recommended (D1 C+A, D2 AI story in the template's design, D3 brief card, D4 critic for Pro/Gold, D5 qualitative).
**Phase 1 built** (brief card, facts/keepDesign/mustCover, story arcs + grounding rules in `ai/instructions`, code quality gate with one repair pass, critic for premium tiers, theme preserved on rewrite).
**Phase 2 built and live with Unsplash:** the picture picker (`services/api/src/pictures`: imageIntent → Unsplash (then Pexels if `PEXELS_API_KEY` is set) → tagged library → vision match check ≥ 4/5, else no picture). Photos carry an on-slide credit and the download ping Unsplash requires. **Unsplash demo apps are limited to 50 requests/hour** (≈ 5–6 decks/hour; searches are cached 30 min) — apply for Production in the Unsplash developer dashboard (5,000/hour) before launch.
Phase 3 (golden set, judge, feedback buttons) not started.

## 1. The promise (what a user must always get)

1. **Their words, not ours.** Every slide is about *their* topic and uses *their* facts. No sample text, no invented statistics, names or quotes.
2. **The design they chose stays.** If they picked a template, its colours, fonts, style, motion and layout look never change. Only content and pictures change.
3. **Pictures that mean something.** Each picture matches *that slide's* content. A QA slide never shows a campus, a handshake or a random circuit board unless the slide is about it.
4. **One connected deck.** One voice, one language, consistent titles, even density, a story with a start, middle and close.
5. **Honesty.** When the AI cannot do something it says so; when it is unsure what the user means it asks (once) or shows its understanding before spending credits.
6. **Safe to try.** The previous version is always kept; failed or cancelled work is refunded.

## 2. Where it happens today (flow map)

| Entry | Steps in code |
|---|---|
| **A. Prompt on Home / landing** | `POST /generation/analyze` → (broad topic → directions) → choose length + model → `POST /generation/jobs` → `generation/pipeline.ts`: analyse → outline → slide content (batches of 4) → `composeDeck` in a design → validate → save |
| **B. Template → "tell me what to put" popup** | create deck from template → `?new=1` → `DeckRewriteDialog` → `POST /generation/jobs {targetPresentationId}` → same pipeline, written into the existing deck as a new version |
| **C. "Edit with AI" chat** | `POST /presentations/:id/ai-assist` → closed set of operations (`set_template`, `set_colors`, `set_motion`, `set_fonts`, `edit_slide`, `add_image`, `rewrite_deck`) validated server-side; `rewrite_deck` hands over to the B pipeline |

Prompts live in `services/api/src/ai/prompts.ts`, `ai-assist.ts`, `ai-edit.ts`; deterministic guards in `generation/policy.ts`; layouts in `packages/theme`.

## 3. What has gone wrong (root causes) and status

| # | Symptom | Root cause | Status |
|---|---|---|---|
| 1 | Rewriting a template deck **changed its theme** | the pipeline always picked a *new* design | **Fixed** — rewrite reuses the deck's exact theme (tested) |
| 2 | Assistant edited only slide 1 / ignored "update all slides" | no operation for "replace the content of the whole deck"; many `edit_slide` ops capped | **Fixed** — `rewrite_deck` operation |
| 3 | Prompt decks looked plain | no design, no pictures | **Fixed** — design + photo-led layouts |
| 4 | **Pictures unrelated to the slide** (server room for a QA title) | pictures came from a *generic library of 81 photos* picked by slot, not by meaning | **Built** — picked by meaning and vision-checked; needs `PEXELS_API_KEY` for real coverage |
| 5 | Sample copy can survive in places | no automated "sample leakage" check | **Fixed** — `generation/quality.ts` |
| 6 | Misunderstood brief is only discovered after credits are spent | no "here is what I understood" step | **Fixed** — brief card before building |
| 7 | No way to know the AI is getting worse/better | no evaluation set | **Open — Phase 3** |
| 8 | Real Google spend ≠ dashboard (scripts bypassed the ledger) | fixed in scripts; reconciliation page added | **Done** |

## 4. Target flow, step by step (the "AI contract")

Each stage has: **input → output (schema) → must / never rules → check → fallback**. A stage that fails its check retries once with the failure reason, then falls back; it never silently ships a bad result.

### Stage 0 — Understand (new)
- **Input:** the user's text, attached sources, links, chosen template (if any), plan.
- **Output:** a *brief card* the user can see and edit before generation: title, audience, goal, tone, language, deck family, slide count, **the facts the user gave** (bullet list), and constraints ("keep my design", "no numbers", "formal").
- **Must:** extract constraints literally ("don't change colours" → `keepDesign=true`); detect language; list every concrete fact supplied.
- **Never:** invent audience/goal; add facts.
- **Check:** if the brief is too thin (< ~12 words and no sources) ask ONE question with 3 one-tap options, otherwise proceed.
- **UX:** for Home prompts a compact "Here's what I'll build" card (edit / confirm). For the template popup the same card appears after "Create my slides" and before credits are charged. Skippable via "Don't ask again".

### Stage 1 — Analyse
- Output: `PromptAnalysis` (+ `category`, `keepDesign`, `facts[]`, `mustCover[]`).
- Category guide is explicit (tech includes QA/testing/IT even in an internship context) — already in the prompt.
- **Check:** `category` ∈ enum, language matches the input language, `facts` are substrings/paraphrases of user text (cheap similarity check).

### Stage 2 — Outline (story)
- Input: analysis + a **story arc per family** (e.g. education/learning: *context → what I did → skills → real examples → results → reflection → next steps*; pitch: *problem → solution → market → traction → ask*; …). Arcs live in one file, reviewed by you.
- Output: slides with `purpose`, `layout`, `keyPoints[]` and **`imageIntent`** (what the picture on this slide should *show*, in plain words, or `none`).
- **Must:** every `mustCover` item appears; layout per content shape; ≥2 picture slides for decks ≥ 6 slides; numeric layouts only if real numbers exist.
- **Never:** two consecutive identical layouts ×3; generic filler ("Key takeaways" pads) unless the user gave nothing to say.

### Stage 3 — Slide content
- **Grounding rule:** every claim must be traceable to (a) a user fact, (b) a source, or (c) an explicitly *general explanation* (flagged internally as `kind: explanation`) — never a statistic, date, name, quote or result the user didn't give.
- Length caps per layout (already in schemas), parallel bullet grammar, sentence-case titles that state the point, speaker notes in the user's voice.
- **Check (deterministic):** language, banned patterns (digits not in user text, "Lorem", "Northwind", "Contoso", template sample strings), duplicate titles, empty slides, overflow (existing validator).

### Stage 4 — Imagery (the big one — see Decision D1)
- For each slide with `imageIntent`: build a **picture brief** = slide title + keyPoints + deck topic + style guide (one consistent photographic style per deck) + "no text/logos/people's faces looking at camera unless asked".
- Source: per D1 (stock search / AI-generated / tagged library).
- **Verify before accepting:** a vision call scores "does this picture match the slide (1–5)?" Below 4 → next candidate; after N tries → use a tasteful *non-photo* fallback (gradient/shape composition from the theme) instead of a wrong photo. **A missing picture is better than a wrong one.**
- Alt text from the brief; attribution stored when required.

### Stage 5 — Compose
- Deterministic (`composeDeck`) in the **chosen design with its theme untouched**. Photo style (full / split / circle / arch / frame) comes from the design.

### Stage 6 — Quality gate (before the user sees it)
Automatic checks, one auto-repair pass, then flag whatever remains:
1. theme identical to the input theme when `keepDesign`
2. no sample leakage / no invented numbers
3. every `mustCover` covered
4. language + tone consistent; titles sentence case
5. text fits, contrast OK (existing validator)
6. each picture scored ≥ 4 or replaced by the fallback
7. no picture used twice
Optional **critic pass** (a second model reads the whole deck against the brief and lists defects) for Pro/Gold.

### Stage 7 — Present and recover
- Show the deck; a small banner: "Built from your details · N pictures · what I assumed" with one-click **Regenerate this slide / Change this picture / Undo whole rewrite**.
- Credits: charged per slide as today; image credits per picture; refunds on failure; the plan limits (pictures per deck/month) are enforced server-side.

## 5. The assistant ("Edit with AI") rules
- Whole-deck content request ⇒ `rewrite_deck` (never many `edit_slide`). ✔
- "Don't change theme/colours/fonts" is honoured by construction (rewrite never touches the theme).
- Restyle requests change **only** theme operations; content requests change **only** content.
- Every reply states exactly what was changed, and what was *not* possible. ✔
- Picture requests create a proposal (cost shown) — after D1, "fix the pictures on all slides" becomes one operation `refresh_images`.

## 6. How we "train" it so it stops making mistakes
We are not fine-tuning a model (slow, expensive, brittle). We make behaviour reliable with:
1. **One instruction source of truth** — prompts split into versioned files (`ai/instructions/system, analysis, outline, slides, imagery, assistant`) with a short changelog; every change reviewed.
2. **Few-shot examples** — 2–3 *good* and 1 *bad* example per family and layout, written by us.
3. **Golden set** — 40 real-looking briefs (10 families × languages × thin/rich/with-sources/"keep my design") with automatic checks (Stage 6 rules) **plus an LLM judge** scoring relevance, grounding, tone, picture match. Run before every prompt change and nightly; the numbers are shown on the owner dashboard (Prompts section).
4. **Feedback loop** — 👍/👎 + "this is wrong" on each generated deck/slide/picture, capturing the brief, output and reason into a review queue; reviewed items become new golden cases.
5. **Guard rails in code, not prompts** — anything that must *never* happen (theme change, invented numbers, sample text, wrong-picture) is checked in code, so a model slip is caught, not shipped.

## 7. Acceptance criteria (measurable)
| Criterion | Target |
|---|---|
| Theme unchanged when rewriting a template deck | 100 % (automated test) |
| Sample/template text left in a rewritten deck | 0 slides |
| Invented numbers when the user gave none | 0 |
| Picture-to-slide match (judge score ≥ 4/5) | ≥ 90 % of pictures; remainder replaced by fallback, never shown wrong |
| Brief coverage (`mustCover` present) | ≥ 95 % |
| Deck generation time (10 slides) | text < 60 s; pictures appear progressively < 3 min |
| Cost per 10-slide deck (text + pictures) | published in the owner dashboard, within the plan's credits |

## 8. Phases
| Phase | What | Effort |
|---|---|---|
| **1 — Reliability** | Brief card (Stage 0), constraints extraction, Stage 6 code checks (leakage, numbers, coverage, theme), one auto-repair, instruction files + story arcs, regenerate-slide button | ~3–4 days |
| **2 — Relevant pictures** | `imageIntent` in the outline, picture briefs, chosen source (D1), vision verification, fallback composition, progressive fill-in, `refresh_images` assistant op | ~4–6 days |
| **3 — Evaluation** | Golden set + judge + dashboard panel, feedback buttons + review queue, nightly run | ~3 days |
| **4 — Polish** | Critic pass for Pro/Gold, more families/arcs, per-language tuning | ongoing |

## 9. Decisions I need from you

**D1 — Where do topic-specific pictures come from?** (my recommendation: **C + A**)
- **A. Generate with the image model** (relevant, unique; ~₹4–6 each, ~15–25 s each; your trial key allows ~1 image/minute, so a 10-picture deck would take many minutes until we have a paid quota; plan limits already cap pictures per deck).
- **B. Match from our own library**, tagged by topic (free, instant, but only as relevant as the library; we'd need ~300+ more tagged pictures for decent coverage).
- **C. Stock photo search** (Pexels / Unsplash API): the AI writes a search query from the slide, we pick the best match with the vision check, store it with attribution. Free, fast, real photos, genuinely relevant ("software testing", "bug report", "laptop code"). Needs a free API key from you.
- **Recommended:** C by default for every deck, A as the paid "generate a custom picture" option per slide, B only as the final fallback.

**D2 — Template + brief: keep the template's slide structure or let the AI design the story?**
- *Keep structure*: same number/order of layouts as the template preview the user saw (11 slides for pitch); the AI fills them. Predictable, but a thin brief gets padded.
- *AI story in the template's design* (what happens today): the AI chooses slide count/layouts for the content.
- **Recommended:** AI story, but start from the template's layout *rhythm* (title, agenda, picture slide every 3rd…), and let the user choose slide count in the brief card.

**D3 — Brief card before generating?** (Stage 0) **Recommended: yes**, skippable. Costs one extra second, saves wrong decks.

**D4 — Critic pass (second model reviewing the whole deck):** +~30 % cost per deck. **Recommended:** on for Pro/Gold, off for Starter.

**D5 — Unknown facts:** when a slide needs a number/result the user didn't give — **(a)** write qualitatively (today), or **(b)** put a clearly marked placeholder like "[add your result]" the user can fill. **Recommended: (a)** with an "add details" hint on that slide.

---
*When you approve (or change) the decisions above I will implement Phase 1 and 2 in that order, each with automated tests and the browser checks, and update this file as the single reference.*
