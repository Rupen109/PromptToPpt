# AI assistant v2 (editing with AI): architecture proposal

Status: **BUILT 2026-11-01 (approved by the owner), switched on by default, NOT yet tested with the real model.** The owner tests it (real-model evaluation, browser suites, cost readings) before v1 is deleted.

### Build status
| Part | Where | State |
|---|---|---|
| Stage 1 deck state (slide index, focus, deck look) | `services/api/src/assistant/state.ts` | built |
| Stage 2 understand (cheapest model, `assist_understand` in the usage log) | `assistant/understand.ts` | built |
| Stage 3 resolve (numbers, ranges, last N, current, just changed, titles → question with buttons) | `assistant/resolve.ts` | built |
| Stage 4 capability registry, 18 families | `assistant/capabilities/` (`writing.ts`, `look.ts`, `slides.ts`, `index.ts`) | built |
| Stage 4b focused writing call (`assist_write`), cache-friendly order, size limits, batches of ≤ 8 slides | `assistant/planner.ts` | built |
| Stage 5 check + one targeted retry (text, layout, add slide) | each capability's `check` | built |
| Pipeline (plan → authorise credits → execute → validate with `compileAssist`) | `assistant/pipeline.ts` | built |
| Route: v2 by default, v1 kept as fallback behind the `assistant_v2` flag (admin → Flags → off = old assistant) | `routes/presentations.ts` (`assistV2`) | built |
| Editor: server-given ids for new slides, delete / move / duplicate / lock / gradient / remove pictures in one undo step; assistant history puts back deleted slides, order and locks; answer buttons for questions | `apps/editor/src/editor/commands.ts`, `AiPanel.tsx` | built |
| Unit tests (mock model, free): stages, pipeline, real-chat cases, route credits | `assistant/assistant.test.ts` (22), `assistant/route.test.ts` (11), editor tests (+3) | pass |
| Real-model evaluation (30 phrasings incl. the real chats, tokens per stage) | `services/api/scripts/assistant-eval.ts` | rewritten for v2, **not run** (owner's cost window) |
| Credits | flat policy (1 unit, 2 when more than one slide is written; undo / questions / chat free), `priceUnits` in `pipeline.ts` | built; "pay for the work done" waits for the owner |
| Delete v1 (old prompt + keyword checks, section 6) | | after the owner's tests pass |
| Group G (elements: shapes, tables, charts, moving elements), hide slide, icons | | not built yet (next phase) |
| Browser suites 05 / 49 / 50 / 54 / 55 | | not re-run; suite 05 expects v1's "which slide?" chips for a vague request, v2 acts on the current slide instead (owner decision 2 in section 11) |
Reads with: `docs/AI_ASSISTANT_ARCHITECTURE.md` (how v1 works today).

---

## 1. Why v1 keeps making a mess

v1 is **one big AI call that does everything at once**:

```
message ──► keyword checks ──► ONE prompt (29 rules + every operation + deck + templates + chat) ──► operations ──► guards ──► editor
```

| Problem | What it causes (real chats) |
|---|---|
| The model must understand, find the slides and write content in **one step** | "update layout of slides 7-10" was answered with a text rewrite, then "not supported", then "which layout?" |
| **Keyword checks** run before and after the model (`needsSlideChoice`, `LOOK_OF_THE_SLIDE`, `needsTemplates`, `needsLayouts`, `ASKS_FOR_BACKGROUND`, `scopeColourToJustChangedSlide`, `aimsAtOneSlide`) | They work only for the phrasings someone already thought of; every new phrasing needs a new check (patch work) |
| **One long rule list** (29 rules) that grows after every bad chat | Rules fight each other: adding "decide, don't ask" broke "color should be brown" (whole deck recoloured) |
| **"It", "that page", "the new slide"** are guessed by the model from chat history | After "add thank you page", "color should be brown" recoloured the whole deck |
| Every request sends **everything** (all rules, all operations, the template list, the chat) | ~7,450 input tokens per request, $0.0048 on Flash. On Gold that is about break-even per edit |
| Nothing checks the **result** against what was asked | A slide "rewritten" with the same words, or a colour put on the wrong slide, is reported as "Done" |

The root cause: **understanding, finding the target, and doing the work are mixed in one prompt.** Fixing that mixture with more rules and keyword checks is the patch work we stop now.

---

## 2. The v2 design in one picture

Five stages. Each one does **one job**, has **its own small input**, and can be **tested on its own**.

```
                 ┌──────────────────────────────────────────────────────────────┐
 message ──────► │ 1. DECK STATE        plain code, $0                          │
                 │    slide index · focus (current / just added / just changed) │
                 │    deck look · recent changes                                │
                 └──────────────────────────────┬───────────────────────────────┘
                                                ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │ 2. UNDERSTAND        cheapest model, ~900 tokens, ~$0.0003   │
                 │    what kind of task · which slides (as references)          │
                 │    simple values (colour, layout name, photo words, count)   │
                 │    act now or ask one question                               │
                 └──────────────────────────────┬───────────────────────────────┘
                                                ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │ 3. RESOLVE           plain code, $0                          │
                 │    references ──► real slide ids (numbers, "last 3", titles, │
                 │    "the new slide", "this one"); ambiguous ──► ask           │
                 └──────────────────────────────┬───────────────────────────────┘
                                                ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │ 4. DO                capability from the registry            │
                 │    a) no writing needed (colour, background, undo, photo,    │
                 │       theme, readability): done by code, NO second AI call   │
                 │    b) writing needed (text, layout, new slide): ONE focused  │
                 │       AI call with only that capability + only those slides  │
                 └──────────────────────────────┬───────────────────────────────┘
                                                ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │ 5. CHECK + APPLY     plain code, $0                          │
                 │    validate (locked, plan, limits) · did the result do what  │
                 │    the intent asked? one targeted retry if not · one undo    │
                 └──────────────────────────────────────────────────────────────┘
```

**What each stage is NOT allowed to do** (this is what keeps it clean):
- Stage 2 never writes slide content and never sees the whole deck's text.
- Stage 3 never calls a model.
- Stage 4b never decides *which* slides or *what kind* of task: that is already decided.
- No stage has keyword rules about specific phrasings. Phrasing is the model's job (stage 2); facts (slide numbers, what was just added) are code's job (stages 1 and 3).

---

## 3. The stages in detail

### Stage 1. Deck state (code)
Built from the document and the chat's saved history, every request. Small and exact.

```ts
interface DeckState {
  slides: { n: number; id: string; layout: string; title: string; background: string; locked: boolean; handEdited: boolean }[]
  focus: {
    current: string | null            // the slide on screen
    lastAdded: string[]               // slides the assistant added in its last answer
    lastChanged: string[]             // slides its last answer changed
    lastChangeKind: 'theme' | 'slides' | 'look' | null
  }
  look: { theme: string; mode: 'light' | 'dark'; colors: {...}; fonts: {...}; commonBackground: string; layoutsInUse: Record<string, number> }
  plan: { canUseTemplate: (id) => boolean; maxSlides: number; ... }
}
```
The "focus" replaces guessing from chat history. "It", "that", "the new page" are answered from facts, not from wording.

### Stage 2. Understand (cheapest model, structured answer)
Input (~900 tokens): the message, the last 2 chat turns, the slide index (number + title + layout, one line each), the focus, and the list of task kinds. **No slide text, no template list, no rules about specific phrasings.**

```ts
interface Intent {
  kind: 'edit' | 'question' | 'chat' | 'off_topic'
  tasks: Task[]                       // in order; several tasks = one undo step ("add 2 slides after 3 and make them blue")
  clarity: 'act' | 'ask'
  question?: { text: string; options: string[] }   // shown as buttons
}
interface Task {
  family: 'layout' | 'text' | 'add_slide' | 'remove_slide' | 'move_slide' | 'background' | 'palette'
        | 'theme' | 'fonts' | 'motion' | 'picture' | 'readability' | 'undo' | 'rewrite_deck' | 'enrich'
  targets: Ref[]                      // WHICH slides, as references (resolved by code in stage 3)
  values: Record<string, unknown>     // e.g. { color: '#7C2D12' }, { layout: 'timeline' }, { query: 'city skyline' }, { count: 2 }
}
type Ref =
  | { by: 'number'; n: number } | { by: 'range'; from: number; to: number } | { by: 'last'; count: number }
  | { by: 'current' } | { by: 'just_added' } | { by: 'just_changed' } | { by: 'all' }
  | { by: 'title'; text: string } | { by: 'kind'; layout: string }          // "the thank you page", "the comparison slides"
```

### Stage 3. Resolve (code)
Turns references into real slide ids, using the deck state only:
- numbers, ranges, "last 3", "current", "just added": exact.
- titles: matched against the slide index; one match = that slide; several = a question with the matches as buttons; none = say so and list what exists.
- checks every id exists, is not locked, is allowed by the plan. An invalid answer from stage 2 becomes a question, never a wrong edit.

### Stage 4. Do (capability registry)
Every ability is **one entry** in code. The registry replaces the 29-rule prompt.

```ts
interface Capability<V> {
  family: Task['family']
  values: ZodSchema<V>                     // what stage 2 must provide (checked)
  writes: boolean                          // false = done by code, no second AI call
  card?: string                            // only for writes=true: the rules + examples + JSON shapes for THIS job (~300-700 tokens)
  context?: (s: DeckState, ids: string[]) => string   // only the slides it needs, in full
  run: (s: DeckState, ids: string[], v: V, ai?: Planner) => Promise<Changes>   // produces the same Changes the editor applies today
  check: (before: Presentation, after: Presentation, ids: string[], v: V) => Problem[]   // stage 5
  price: (ids: string[], v: V, tier: Tier) => number   // credits
  after?: (d: Draft, ids: string[]) => void            // rules that must always hold, e.g. a new slide takes the deck's background
}
```

| Family | writes? | Done by | Example |
|---|---|---|---|
| background | no | `setSlideBackground` | "make the thank you page brown", "same as the other slides" |
| palette / theme / fonts / motion | no | `applyTheme`, `setFonts`, ... | "make it dark", "use a serif font" |
| picture (free photo) | no | photo search + `placePhoto` | "update the bg image" |
| readability | no | `makeSlideReadable` | "the text is not visible" |
| undo | no | `revertAssist` | "undo that", "I didn't like it" |
| remove / move slide | no | editor commands | "delete slide 4", "move the team slide to the end" |
| text | yes | one AI call, card "edit words, keep shape" | "make slide 3 shorter", "add 2 points" |
| layout | yes | one AI call, card "refit these slides into other layouts" + layout shapes | "update layout of slides 7-10" |
| add_slide | yes | one AI call, card "write a new slide that fits the deck" | "add a thank you page", "2 slides after slide 3" |
| rewrite_deck / enrich | yes | the existing generation / enrichment pipelines | "make this deck about my startup" |

Adding a new ability later = one registry entry + one editor command + eval cases. No prompt surgery.

### Stage 5. Check + apply (code)
- The existing server validation stays (locked, hand-edited, plan, limits, no invented facts).
- Each capability's `check` compares before/after with the intent: the right slides changed, the layout really changed, the list really grew by N, the text is not the same as before, the background is on the slide that was meant.
- If a check fails: **one** retry that names the exact problem ("slide 9 still has 4 points; it needs 6"). Still failing: the reply says plainly what did not work. Never a false "Done".
- The editor applies everything as **one undo step**, as today.

---

## 4. Real chats, walked through v2

**"update layout of slide no : 7,8,9 and 10, currently all are in same layouts"**
1. State: slides 7-10 are all `split-image-text`.
2. Understand: `{family:'layout', targets:[7,8,9,10], values:{}}`, act.
3. Resolve: 4 ids, none locked.
4. Do: layout card + those 4 slides' words + the deck look and layouts in use. The model picks 4 different layouts that fit each slide's content and refits the words.
5. Check: all 4 layouts changed, not all the same, no slide empty. Apply as one undo.

**"add thank you page also"** then **"color should be brown"** then **"means it should match with our other slides"**
1. After the first answer, state: `focus.lastAdded = [slide 11]`. The new slide got the deck's common background (`after` rule of add_slide).
2. "color should be brown": understand gives `{family:'background', targets:[just_added], values:{color:'#7C2D12'}}`. Resolve: slide 11. Done by code, **no second AI call, no deck recolour possible** (the palette ability is simply not the chosen task).
3. "match with our other slides": `{family:'background', targets:[just_changed], values:{color:'deck'}}`. Done by code.

**"you create new layout based on our theme of slides"** (after the assistant asked a question)
Understand reads the last 2 turns and the focus: the targets are the slides from the previous message; clarity = act (the person delegated the choice).

**"add 4 more slides in between"**
Understand: `{family:'add_slide', targets:[], values:{count:4, where:'spread'}}`. Code spreads them through the middle; the reply says where they went. One question only if the person's own words make two very different readings possible.

---

## 5. Cost: making every edit cheap and profitable

### Today (measured from `ai_usage_event`, last 5 days)
| Model | Requests | Avg input tokens | Avg cost / request |
|---|---|---|---|
| Gemini 3.6 Flash | 792 | 7,458 | **$0.0048** |
| Gemini 3.1 Flash Lite | 627 | 7,391 | **$0.0018** |

Revenue per credit uses the **v4 plans** (`docs/PRICING_PLANS_V4.md`; the plans in the seed are placeholders), net of 18% GST and payment fees, at ₹88 per $:

| Plan | Price (India) | Credits / month | Net revenue per credit |
|---|---|---|---|
| Lite | ₹299 monthly / ₹249 yearly | 1,000 | ~$0.0028 / ~$0.0023 |
| Pro | ₹499 monthly / ₹399 yearly | 3,000 | ~$0.0016 / **~$0.00125** |
| Gold | ₹1,199 monthly / ₹799 yearly | 6,000 | ~$0.0019 / **~$0.00125** |

The tightest case is **India yearly Pro and Gold: ~$0.00125 per credit**. All margins below use that worst case.
Today a one-slide Flash edit is charged 4 credits = ~$0.0050 against ~$0.0048 cost: **about 4% margin**, i.e. no profit on the most common request.

### v2 (estimated; phase 1 measures it before anything is switched)
| Request type | Calls | Input tokens | Est. cost |
|---|---|---|---|
| No writing (colour, background, photo, undo, theme, readability) ~45% of requests | stage 2 only (Flash Lite) | ~900 | **~$0.0003** |
| One slide text edit | stage 2 + one focused call | ~900 + ~1,800 | **~$0.0015** (Flash) |
| Layout of 4 slides / new slide | stage 2 + one focused call | ~900 + ~2,500 | **~$0.0023** (Flash) |
| **Average** | | | **~$0.0011, about 75% less than today** |

### How the saving is made (no quality loss)
1. **Most requests need no writing**, so they need no big model call at all.
2. **The focused call gets only one capability card and only the target slides.** No 29 rules, no template list, no other slides, no chat history (stage 2 already turned the chat into exact targets).
3. **Cache-friendly order**: the fixed part (system text + capability card) first, the changing part last. Gemini then bills the fixed part at the cached rate (today only ~25% of input is cached).
4. **The cheapest model does the understanding**; the model the person chose (Flash, Pro...) is used only for writing.
5. **Hard budgets per stage**: understand ≤ 1,200 input / 200 output tokens; focused call ≤ 4,000 input typical, 6,000 maximum. Over the limit = trim the context, never send more.
6. **At most one retry**, and only when a check fails.

### Fairer credits (proposal, the owner decides)
Charge for the work done, not a flat price per message. Margins at the worst case ($0.00125 per credit):

| What happened | Credits | We earn | v2 cost | Margin |
|---|---|---|---|---|
| Question, chat, a question back to the person, undo | 0 | $0 | ~$0.0003 (or $0 for undo) | covered by the rest |
| Done by code (colour, background, photo, theme, readability) | 1 | $0.00125 | ~$0.0003 | **~76%** |
| Text edit, 1 slide (Flash, the v4 default model) | 3 | $0.00375 | ~$0.0015 | **~60%** |
| Layout of 4 slides (3 per slide written) | 12 | $0.0150 | ~$0.0023 | **~85%** |
| New slide (3 per slide written) | 3 | $0.00375 | ~$0.0016 | **~57%** |
| Frontier model, per slide written | 8 | $0.0100 | ~$0.004 | ~60% |
| Rewrite deck / enrich from document | generation pricing (as today) | | | |

Compared with today (4 credits for every message, ~4% margin on Pro/Gold yearly): simple requests get **cheaper for the person** (1 credit instead of 4) and **every request type is profitable** on every plan, including the tightest one. A Free user's 100 credits buy about 100 quick changes or 30 slide rewrites, costing us at most ~$0.05.

---

## 6. What we keep, what we delete

**Keep (these are good structure):**
- closed operation list, server validation, one undo step, undo saved with the chat (`applyAssist`, `snapshotAssist`, `revertAssist`)
- editor commands as the single source of truth (toolbar, media library and assistant use the same code)
- free photo lookup (`photo-resolve.ts`), `restructure_slide`, the deck look given to the model, "a new slide takes the deck's background" (becomes the add_slide capability's `after` rule)
- usage ledger, credits, the evaluation script (extended)

**Already deleted (2026-11-02 review):** the colour-scope guard (`scopeColourToJustChangedSlide`), the keyword gates for templates and layouts (`needsTemplates`, `needsLayouts`), the keyword-based slide selection (`slidesNeededInFull`, outline mode and its second try), the "did nothing" retry, and the "colour scope" / "decide, don't ask" prompt rules.

**Delete once v2 passes the owner's tests (the rest of v1):** the v1 prompt (`aiAssistPrompt`), `needsSlideChoice`, `LOOK_OF_THE_SLIDE`, `aimsAtOneSlide`, `ASKS_FOR_BACKGROUND`, `isSmallTalk`, the "N more points" retry, and the v1 branch of the route. `compileAssist` stays: it is the validation stage of v2.

---

## 7. Code layout

```
services/api/src/assistant/
  state.ts            stage 1: DeckState from the document + saved chat
  understand.ts       stage 2: Intent schema, prompt, call
  resolve.ts          stage 3: references -> slide ids, questions with options
  capabilities/
    index.ts          the registry
    background.ts  palette.ts  theme.ts  fonts.ts  motion.ts  picture.ts  readability.ts  undo.ts
    text.ts  layout.ts  add-slide.ts  remove-move.ts  rewrite-deck.ts  enrich.ts
  planner.ts          stage 4b: builds the focused call (cache-friendly order, budget)
  check.ts            stage 5: runs each capability's check, one targeted retry
  pipeline.ts         runs the stages, budgets, timeouts, ledger entries per stage
  pricing.ts          credits from what was done
routes/presentations.ts   the /ai-assist route becomes: auth, gates, pipeline, response (same response shape, so the editor barely changes)
```
The editor keeps the same response contract (`theme`, `edits`, `additions`, `backgrounds`, `pictures`, ...), plus `question.options` shown as buttons.

---

## 8. Quality: measured, not hoped

- **Eval set per family** (layout, text, add_slide, background, palette, picture, undo, multi-task, questions), each with: the phrasing, the deck state, the expected intent, the expected changes. Includes every real chat that went wrong.
- Three numbers per run, per model: **intent accuracy** (stage 2), **result accuracy** (after stage 5), **cost per request**. Target before switching: ≥ 97% result accuracy on Flash Lite and Flash, average cost ≤ $0.0015.
- Stage 2 can be tested alone (cheap, fast) because its output is structured.
- **Every bad chat becomes an eval case, never a new prompt rule.**
- Per request we log: intent, family, stages run, tokens and cost per stage, checks failed, retried or not, and the person's 👍 / 👎. The admin page shows accuracy and cost per family.

---

## 9. Build plan (each phase ends with real-model eval + browser suites, no push without asking)

| Phase | Work | Switch on? |
|---|---|---|
| 1 | `state.ts`, `understand.ts`, `resolve.ts` + eval of stage 2 alone on real phrasings; measure its cost | no (shadow: runs beside v1, logs only) |
| 2 | registry + the no-writing families (background, palette, theme, fonts, motion, picture, readability, undo) | yes, for those families |
| 3 | writing families (text, layout, add_slide) with cards, checks, one retry | yes |
| 4 | rewrite_deck, enrich, remove/move slide, multi-task answers | yes |
| 5 | delete the v1 prompt and every keyword check listed in section 6; new credit table (if approved); admin view | v1 removed |

While phases run, v1 stays the fallback, so nothing gets worse for users in between.

---

## 10. Every kind of task v2 handles

Legend. **How:** `code` = done by code after the understand step (no second AI call, ~1 credit); `write` = one focused AI call that writes content (credits per slide written); `free` = no charge.
**Ready:** ✅ the editor command already exists (v2 only needs the registry entry) · 🔧 needs a small new editor command first.

### A. Slide content (words)
| Task | Examples | How | Ready |
|---|---|---|---|
| Rewrite / improve | "rewrite slide 3", "make it more professional", "improve the hierarchy" | write | ✅ |
| Shorten / expand | "make slide 2 shorter", "add more detail to the pricing slide" | write | ✅ |
| Add / remove points | "add 2 more bullet points", "remove the last point", "both sides of the comparison" | write | ✅ |
| Change one field | "change the title of slide 4 to Our Roadmap", "fix the typo in the subtitle" | write (or code when the exact new text is given) | ✅ |
| Tone / audience / reading level | "make it simpler for students", "more formal", "more persuasive" | write | ✅ |
| Translate | "translate slide 5 to Hindi", "translate the whole deck to Gujarati" | write | ✅ |
| Fix grammar / spelling / consistency | "fix grammar everywhere", "same title style on every slide" | write | ✅ |
| Content from a source | "use the PDF I attached for slide 6", "update this slide from this link" | write (with source excerpts) | ✅ |
| Add facts / numbers from the web | "add the latest market size" | write (web research, Gold) | ✅ |
| Speaker notes | "write speaker notes for every slide", "shorter notes on slide 3" | write | ✅ |
| Summarise / key takeaway slide | "add a summary slide of the whole deck" | write (add_slide) | ✅ |

### B. Slide structure (layout)
| Task | Examples | How | Ready |
|---|---|---|---|
| Change layout | "update layout of slides 7-10", "make slide 4 look different" | write | ✅ |
| Named layout | "make slide 5 a timeline", "turn this into a comparison", "show these as steps" | write | ✅ |
| Content into a table / chart | "show these numbers as a bar chart", "put this in a table" | write | ✅ |
| Split / merge slides | "split slide 6 into two", "merge slides 3 and 4" | write | ✅ |
| Picture + text ↔ text only | "remove the picture side", "add a picture next to the text" | code | ✅ |

### C. Slides in the deck
| Task | Examples | How | Ready |
|---|---|---|---|
| Add slides | "add a thank you page", "2 slides after slide 3", "4 slides in between", "an agenda after the title" | write | ✅ |
| Delete slides | "delete slide 4", "remove the last two slides" | code | ✅ |
| Move / reorder | "move the team slide to the end", "swap slides 2 and 3" | code | ✅ |
| Duplicate | "duplicate slide 5" | code | ✅ |
| Lock / unlock | "don't let AI change slide 2", "unlock all slides" | code | ✅ |
| Hide / skip a slide when presenting | "hide slide 7" | code | 🔧 |
| Section dividers | "add section breaks between topics" | write | ✅ |

### D. Look of one slide
| Task | Examples | How | Ready |
|---|---|---|---|
| Background colour | "make the thank you page brown", "same as the other slides" | code | ✅ |
| Background gradient | "blue to purple gradient on slide 1" | code | ✅ |
| Background picture (free photo) | "update the bg image", "a forest behind slide 3" | code (photo search) | ✅ |
| Remove background picture | "remove the background image" | code | ✅ |
| Readability | "the text is not visible", "make it readable" | code | ✅ |
| Text colour / size / bold on one slide | "make the title red", "bigger title on slide 2" | code | ✅ (`updateElement`, `setRunFlag`) |

### E. Look of the whole deck
| Task | Examples | How | Ready |
|---|---|---|---|
| Template | "use the Midnight template", "a more modern design" | code (model picks the template id in the understand step) | ✅ |
| Palette | "purple and gold", "warmer colours", "I don't like the green" | code | ✅ |
| Light / dark | "make it dark" | code | ✅ |
| Fonts | "use a serif font", "more playful fonts" | code | ✅ |
| Animation | "animate every slide", "no animation" | code | ✅ |
| Brand | "use my brand colours and logo", "brand from my website" | code (brand kit) | ✅ |
| Same style everywhere | "make all slides consistent" | code + write | ✅ |

### F. Pictures and media
| Task | Examples | How | Ready |
|---|---|---|---|
| Add a free photo | "add a picture of a city skyline to slide 2" | code (photo search) | ✅ |
| Replace / better pictures | "the pictures don't match, use better ones" | code (photo search per slide) | ✅ |
| Generated AI picture | "generate an AI image of…" | paid proposal, confirmed by the person | ✅ |
| Remove a picture | "remove the picture on slide 4" | code | ✅ |
| Alt text for pictures | "add descriptions to all images" | write | ✅ |
| Icons in cards | "add icons to the cards" | code | 🔧 |

### G. Elements on a slide (advanced editor) — NOT built in v2 yet (next phase)
| Task | Examples | How | Ready |
|---|---|---|---|
| Add text box / shape / table / chart | "add a red arrow", "add a 3x4 table to slide 6", "a pie chart of these numbers" | code (+ write for the table or chart data) | ✅ |
| Edit table / chart data | "add a row for 2026", "change the 2024 value to 40" | code | ✅ |
| Move / resize / align elements | "centre the logo", "move the image to the right" | code | ✅ (`setGeometry`, `moveElements`) |
| Delete elements | "remove the arrow" | code | ✅ |
| Links | "link the button to my website" | code | ✅ |

### H. Undo, history and questions
| Task | Examples | How | Ready |
|---|---|---|---|
| Undo the assistant's last change | "undo that", "I didn't like it", "go back" | code, free | ✅ |
| Undo part of it | "keep the colours but undo the text change" | code, free | ✅ |
| Undo an older change | "put back what you did before that" | code, free | ✅ |
| Questions about the deck | "how many slides?", "what does slide 3 say?", "what did you change?" | answered from the deck state, free | ✅ |
| Advice | "how can I make this deck better?" | write (answer only, no change) | ✅ |
| Small talk | "hi", "thanks" | free reply | ✅ |

### I. Whole deck at once
| Task | Examples | How | Ready |
|---|---|---|---|
| Rebuild from new details | "make this deck about my startup: …" | generation pipeline | ✅ |
| Enrich from attached document | "add more content from the PDF" | enrichment pipeline | ✅ |
| Change length | "make it 10 slides", "shorter deck" | write (remove / merge / add) | ✅ |
| Quality pass | "check the deck for mistakes and fix them" | write + the existing quality checks | ✅ |

### J. Several tasks in one message
"Add 2 slides after slide 3 about pricing, make them blue and add a photo to each" → understand returns **3 tasks in order**, all resolved, done and checked, applied as **one undo step**, priced as the sum.

### K. Not done by the assistant (it says so plainly and points to the button)
Export / download, sharing and permissions, payments and plan changes, deleting the whole deck, editing another deck, video or audio, anything outside presentations. These are buttons elsewhere in the app; the assistant explains where.

### What adding a task costs later
One registry entry (values schema, `writes`, card, `run`, `check`, `price`) + the editor command if it does not exist (🔧) + eval phrasings. No change to the prompt of any other task.

---

## 11. Decisions for the owner

1. **Approve this architecture** (five stages + capability registry) as the replacement for v1.
2. **Ask or act** when a text edit names no slide ("make the title shorter"): act on the current slide and say so (faster, Undo is one click), or keep asking "which slide?" (safer, one extra step)?
3. **Credit table**: keep the flat price per message, or switch to "pay for the work done" (section 5)?
4. **Speed**: v2 adds one small call (~0.5-1 s) on writing requests; requests done by code become faster than today. Acceptable?

## Separate bug found while testing (not part of this design)
Browser suite 05: after one answer the **Send button stayed disabled**, so every following message timed out (14 of 17 checks). Suites 49, 50, 54 and 55 passed in the same run. To investigate before any release.
