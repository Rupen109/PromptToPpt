# Full test with the real AI, 1,500 users (2026-11-02)

Local machine (one laptop: API, database, website, editor, 30 deck workers and the load generator), real Gemini on Vertex, the new assistant (v2).
Scripts: `services/api/scripts/load-ai.ts` (accounts, report), `apps/editor/scripts/load-ai-people.ts` (the people), `services/api/scripts/worker-pool.ts` (deck workers).
Raw results: `/private/tmp/claude-502/load-ai-run.json` and `load-ai-run-report.json` (kept outside the repository).

## 1. What was run
- **1,500 people**: 600 Starter, 600 Pro, 300 Gold. The first 10 ran 24 at a time; the other 1,490 ran **1,000 at the same time**.
- Each person: signs in → builds a deck with AI (8-12 slides, 28 different topics including Hindi and Gujarati) → **6-8 assistant messages** the way the editor sends them (each answer applied with the editor's own commands and saved with the editor's save call, so the next message works on the real deck and "undo" has real history) → half ask the deck a question → 30% of paid users share it → 20% of paid users export PowerPoint.
- Phrases: layout, text (shorter, add points, catchy title, translate), add slides, colours, dark theme, background colour, background photo, fonts, animation, template, delete, move, undo, questions, thanks.
- No AI pictures were generated (owner rule). Window: 09:53 – 10:27 UTC (34 minutes).

## 2. Results
| | Result |
|---|---|
| Decks built | **1,496 of 1,500** (14,974 slides). 4 failed: 3 "AI busy", 1 network error |
| Deck time, from request to ready | p50 **14 min**, p95 16.5 min (queue: 1,000 decks asked for at once, 30 workers) |
| Assistant messages | **10,490** |
| Answered | 7,500; **97.4 % right** (checked against what each phrase asked) |
| Not answered | 2,180 "AI paused" (our spend breaker, see 3.2), 761 "AI busy" (Google limit), 49 (API restart while raising the breaker) |
| Saves after each change | 6,631 saved, **0 conflicts, 0 failures** |
| Ask the deck | 348 answered; 239 Starter refused (plan has no Ask, by design); 163 "AI paused" |
| Share links | 266 created |
| PowerPoint export | 162 of 175; **13 failed: a bug, see 3.4** (fixed) |

### Assistant accuracy by kind of request (answered messages)
| Kind | Right | | Kind | Right |
|---|---|---|---|---|
| background colour | 357/357 (100 %) | | add slides | 719/722 (99.6 %) |
| fonts | 346/346 (100 %) | | template | 373/375 (99.5 %) |
| delete slide | 361/361 (100 %) | | text | 1,388/1,426 (97.3 %) |
| move slide | 321/321 (100 %) | | picture | 369/381 (96.9 %) |
| questions | 345/345 (100 %) | | animation | 334/353 (94.6 %) |
| thanks / chat | 352/352 (100 %) | | undo | 658/710 (92.7 %) |
| colours | 724/726 (99.7 %) | | **layout** | **660/725 (91.0 %)** |

Response times under 1,000 people at once: p50 2–8 s, p95 18–36 s (layout and text the slowest; both write slide content).

## 3. Findings (what to fix before real traffic)
1. **Deck building is one at a time per API server.** The API runs a single worker loop. With 1,000 people at once even 30 workers meant a 14-minute wait. Before launch: run workers as their own process(es) and size them to expected traffic (the queue is already safe with many workers).
2. **The spend breaker paused AI for everyone after ~10 minutes.** `AI_BUDGET_USD_HOUR` (default $15) / `AI_BUDGET_USD_DAY` ($75) are working as designed, but 1,000 active people spend about $40–70 an hour. Before launch: set them from expected traffic and keep them as the safety ceiling. (They were raised to $60 / $150 for 15 minutes during this run, then restored.)
3. **Google rate limits (429 "resource exhausted").** Of 17,944 understand calls on Gemini 3.1 Flash Lite, 13,900 were refused by Google and retried on Gemini 2.5 Flash; deck calls show the same. The fallback kept the product working, but 761 messages still failed and everything got slower. This is the development Vertex project; production uses OpenRouter, whose limits must be checked (or a Vertex quota increase requested) before launch.
4. **Export crashed for non-English titles** (all 13 failures were Hindi / Gujarati decks): the title went into the download header, which only allows Latin characters. Fixed: the header carries an ASCII name plus the real name encoded per RFC 6266 (`filename*=UTF-8''…`), and the editor reads the real name.
5. **Prompt caching is not happening on Gemini 3.x** (0 cached tokens; only 2.5 Flash cached any). The fixed part of each prompt is already first, so explicit caching would cut input cost further.
6. **Why assistant messages failed**: see section 3b.

## 3b. Why assistant messages failed (analysis, no AI used)
Of **10,490** messages: **7,307 right (69.7 %)**, 193 answered wrongly (1.8 %), **2,990 not answered (28.5 %)**: 2,180 paused by our spend breaker (20.8 %), 761 "AI busy" (7.3 %), 49 during an API restart.
So "major functionality breaking" was mostly **capacity**, not misunderstanding; when the assistant did answer it was right 97.4 % of the time.

**A perfect-model run** (`apps/editor/scripts/offline-ideal.ts`, no AI, no cost: the understanding is always right and the writing valid, everything else is the real server pipeline and the editor's own apply / undo) scores **97.5 %**, the same as the real run. Where it differs from the real run:

| Kind | Real run, wrong | Perfect model, wrong | So the extra is |
|---|---|---|---|
| layout | 9.0 % | 0.9 % | model side, +8 points |
| undo | 7.3 % | 0 % | model side, +7 points |
| motion | 5.4 % | 0 % | model side, +5 points |
| picture | 3.1 % | 0 % | model side, +3 points |
| text | 2.7 % | ~1.5 % (the rest is a limit of the stand-in writer) | mostly our code |

### Defects found (each reproduced offline)
1. **A background change marks the slide "hand-edited"** (`setSlideBackground` calls `touch`). The assistant then refuses to rewrite that slide's words or layout ("edited by hand, I left it alone"), and theme changes stop re-laying it out. Hit about 1 % of messages even in the perfect run; every person who changes a background meets it. *Cause: one flag means two things (the person moved elements / the slide has its own colour).*
2. **Undo can dead-end.** The history entry of a move or a delete carries no usable slide id (a deleted slide no longer exists, a move records no ids). When the model scopes "undo that" to "that slide" (part "slide"), the answer is "I did not change that slide" and nothing happens. In the real run 27 of the 52 wrong undos followed a delete, move or picture.
3. **Task details are checked after the model has answered, with no second chance.** An animation name outside our list ("fade") gives "I didn't understand the details" and nothing is done. 19 wrong animations.
4. **The writer's answer is validated as one block.** One slide that breaks one rule (a missing field, 7 bullets where 6 is the maximum) rejects all of them. The gateway then repairs once and tries the next models (more calls, more time: layout p50 12.9 s) and, when all fail, the person is told **"AI busy"** although Google was fine. 869 of 8,002 writer calls (10.9 %) were rejected this way; the excess "busy" on writing tasks (about 9 % against 5-6 % on tasks that write nothing) suggests roughly 200 of the 761.
5. **We do not record why an answer was rejected.** The usage log has an error code but no detail, and the load script kept only right / wrong. The exact reason for the remaining layout, picture and text misses (the 8, 3 and 1 points above) cannot be read from this run.
6. **One of my own editor tests was silently skipping itself** ("re-laying out a slide keeps its background": after painting the slides the test could no longer find a plain slide, because of defect 1, and returned without checking). It is being replaced.

### Fixed (2026-11-02, checked with unit tests and the perfect-model run; NOT yet with the real AI, which Google is blocking)
| Defect | The fix, at the cause |
|---|---|
| 1. Background marks the slide "hand-edited" | A slide now has its **own look** (`ownLook`): background (colour, gradient or picture) and its text colours. Setting one no longer marks the slide hand-edited. Whenever the slide is composed again (new words, a new layout, a new theme) the chosen look is put back on top of the fresh layout, by one mechanism instead of one patch per case. A colour that was the deck's own follows a new palette; a colour you chose stays. Undo restores the flag exactly. Taking the background away ends the own look. (Only moving or editing elements marks a slide hand-edited.) |
| 2. Undo dead-ends | The history now records **every** kind of change, including which slides were moved (and deleted slides, locks). "Undo that" is the whole of that change: only a slide the person **names** scopes an undo to that slide, enforced where the model's answer is read, whatever scope the model wrote. Undo restores deleted slides in place and the order of moved slides (the whole change, or just the one slide named). |
| 3. Details checked too late | Every task's details are checked **inside the understand step's schema**, so a bad value (an animation name outside the list, a colour that is not a hex) is rejected with the exact reason and the gateway's repair pass asks the model again; it never reaches a capability as a silent "I didn't understand". |
| 4. One bad slide rejects all | The writer's answer is accepted **slide by slide**: the slides that fit are kept, only the ones that do not are asked for again (once, with each reason), a slide that still does not fit is named and left as it was. Each slide's exact point limit is given to the writer as a number. A writer answer that changes a slide's layout when only words were asked is refused and asked again. |
| 5. No record of why | Every failed AI attempt now stores its **reason** (first 300 characters: validation paths and messages, provider text; never the prompt or the answer) in `ai_usage_event.error_detail` (migration 0036). |
| 6. "AI busy" for everything | `AIUnavailableError.answersRejected`: when every model answered but nothing fit our rules the person is told "I couldn't turn that into changes this time. Nothing was changed and you were not charged." (422); "busy" is only for provider failures. |
| (own test) | The vacuous editor test is replaced by 9 tests that cannot skip silently; the other tests that returned early when their setup was missing now fail loudly. |

**Proof with the perfect model (400 people, 2,742 messages, the model deliberately making the old undo mistake):** every kind of request is **100 %** (undo 277/277, layout 270/270, animation 175/175, picture 159/159 …); the only misses (60 of 568 text edits) are slides without a title field (a quote), which the stand-in writer cannot rewrite, not a product defect. Before the fixes the same run showed the "hand-edited" refusals and the undo dead-ends.

**Still open from this analysis:** the real-model part of the gaps (layout, picture and text misses that the perfect run cannot show). With `error_detail` recorded and per-slide retries in place, a real-AI re-run will show exactly why any remaining answer fails.

### Proposed (waiting for the owner): capacity
Section 3, items 1-3, and `docs/DECK_GENERATION_SCALE_ARCHITECTURE.md` (deck workers, throttling toward the provider, plan lanes, autoscaling, the spend ceiling instead of a global pause).

## 4. Cost (our usage ledger)
| | |
|---|---|
| **Total AI cost of the run** | **$32.01** (≈ ₹2,820 at ₹88/$) |
| Per person (1 deck + 7 messages + extras) | $0.0213 |
| Per deck | $0.0144 |
| Per assistant message | $0.00096 |
| Credits used | 81,159 |
| Ledger since the owner's last reading (2026-11-01 09:27) | $32.21 (52,547 AI calls) |

### Per plan
| Plan | People | AI cost | Per person | Credits per person | Cost per 1,000 credits |
|---|---|---|---|---|---|
| Starter | 600 | $7.26 | $0.012 | 29 | $0.42 |
| Pro | 600 | $16.45 | $0.027 | 71 | $0.39 |
| Gold | 300 | $8.30 | $0.028 | 71 | $0.39 |

At the tightest v4 price (India yearly Pro / Gold, ≈ $0.00125 net per credit) a credit costs us ≈ $0.0004: **≈ 69 % margin**; India monthly Pro ≈ 76 %. (The earlier $0.745 per 1,000 credits included AI pictures; this run had none.)

### Where the money went
Deck content (slide_content, outline, critic, analysis, design pick) ≈ $20.3 · assistant (understand + write) ≈ $10.1 · Ask the deck ≈ $0.4. Retries on Gemini 2.5 Flash after Google's 429s added ≈ $4.8 of that.

**To reconcile with Google:** add a new "credit left" reading in admin → Google Cloud. The burn since ₹25,283.31 (2026-11-01 09:27) should match ≈ $32.2 plus the browser suites below.

## 5. Browser suites (every feature and button)
Running after the load test; results are added below.
