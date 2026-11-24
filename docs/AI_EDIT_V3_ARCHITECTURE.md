# Edit with AI v3: architecture plan (proposal, 2026-11-21)

**Status: PROPOSAL. Nothing is built. Needs the owner's approval (section 12) before any code changes.**
Why now: the full QA with real prompts (`docs/AI_FULL_QA_RESULTS.md`) found 34 of 89 requests not done properly, including 13 cases of "Done" when the work was missing or wrong. These are not 34 separate bugs; they come from three structural gaps. This plan replaces those gaps and keeps what already works.

---

## 1. Why it is weak today (read in the code, proven by the QA)

| # | Gap | Where | What users saw |
|---|---|---|---|
| G1 | **"Done" is checked against the AI's own plan, not against what the person asked.** The checks are built from the planned change (`expectationsFromChanges`), so a plan that does less than asked still "verifies". The writer is even told "if the limit stops you, add what fits" and nobody compares that with the request. | `packages/theme/src/assist/expectations.ts`, `capabilities/writing.ts:115` | "add 5 points" → still 4, "Done". "add more content" → same words, "Done". "text red" → slides 9-10 skipped (60-object cap), "Done". |
| G2 | **The AI knows almost nothing about the deck.** The model gets one line per slide: number, layout, title, background. No fonts per role, no text sizes or colours, no point counts or capacity, no "what a normal slide in this deck looks like". | `assistant/state.ts` (`slideIndexText`) | New thank-you slide in a different style; "increase body size" made it smaller; "centre the title" said "already centred". |
| G3 | **What users can ask is prose inside one 4,000+ token prompt**, with almost no real phrasing examples, no list of "done when" rules, and no first-class "I don't know / can't". Everything new is added to the same prompt (its guard was raised 5 times). | `assistant/understand.ts` (`FAMILY_GUIDE`, `ELEMENT_GUIDE`) | "add statistics" → a rectangle; "overlay" → brighter picture; "add images" → replace all pictures; "add more data" → "attach a PDF". |
| G4 | Executors that ignore the slide's layout: moving/resizing objects only warns about overlap. | `assist/element-ops.ts` | Picture covers the title and text; title off the slide. |

What already works and is **kept**: one undo step per request, the server re-checking the SAVED deck, credit settlement and refunds, locks/plan/template rules, confirm-before-destructive, the review, the help answer from a registry, the step-by-step for long messages.

---

## 2. The rules of v3 (non-negotiable)

1. **Done means the person's request is met, checked by code on the saved deck.** Not "we ran our plan".
2. **The AI always knows the deck**: its design (theme, fonts, sizes, colours per text role, backgrounds), each slide's content and capacity, and what is selected.
3. **One catalogue of what users can ask** (section 5) is the single source for: the model's examples, the "done when" checks, the refusals, the help answer, the chips and the test set.
4. **Check feasibility BEFORE changing anything.** If the request cannot be fully met (capacity, plan, lock, unsupported), say so first and offer the real options. Never do less in silence, never do a nearby thing instead.
5. **If the AI does not understand, or cannot do it, it says so plainly**: "I can't do that yet: … Here is what I can do: …". It never says "Done" for something that did not happen.
6. **Keep the design.** Anything the AI adds or changes follows the deck's current theme, fonts, background and style, unless the person asked to change those.
7. **Never break the slide.** No overlaps, nothing off the slide, no unreadable text, no lost pictures. If a change would break the slide, it is fixed or refused with the reason.
8. **The reply is written by code from the verified result**, in the person's terms (the slide numbers they used).

---

## 3. The new pipeline

```
 message + selection + current slide + chat history
        │
 ① DECK KNOWLEDGE (code)      design tokens, per-slide content & capacity, objects, selection, "standard look"
        │
 ② UNDERSTAND (model)         → intent id from the CATALOGUE + slots + scope + confidence (or "unknown" / "unsupported")
        │                        the model gets the 10–20 closest catalogue examples, not the whole guide
 ③ GOAL (code)                → acceptance criteria: what must be true on the deck when it is DONE
        │
 ④ FEASIBILITY (code)         capacity, locks, plan, flags, template rules, object caps
        │                        → ACT  |  ASK (one question, with buttons)  |  CAN'T (plain, with alternatives)  |  OFFER (partly / another way, needs a click)
 ⑤ EXECUTE                    deterministic executors (colour, size, slides, layout, pictures…) + the writer only for words,
        │                        all given the GOAL and the DECK KNOWLEDGE
 ⑥ QUALITY GUARDS (code)      overlap, off-slide, overflow, contrast, lost pictures, design drift, unasked changes
        │
 ⑦ APPLY (editor)             one undo step (unchanged)
        │
 ⑧ VERIFY vs GOAL (code)      editor on the live deck, server on the SAVED deck (unchanged mechanism, new criteria)
        │
 ⑨ REPLY (code)               Done | Partly (what is missing and why) | Couldn't | Asked | Nothing needed
        │
 ⑩ SETTLE + LEARN             credits by verified result (unchanged) + telemetry of intent, outcome, misses
```

What changes against today: ① is new (replaces `slideIndexText`), ② uses the catalogue with retrieved examples instead of one long guide, ③ and ④ are new, ⑥ is new, ⑧ checks the goal instead of the plan, ⑨ uses goal outcomes.

---

## 4. Deck Knowledge (the AI's memory of the presentation)

Built by code from the document on every request (no model, no cost). Two tiers so the prompt stays small:

**Always sent (deck summary, ~300 tokens)**
- Design: theme name, light/dark, colours by name (primary, accent, background, text), heading and body fonts, title style, decor style, the **common slide background**, text sizes per role (title, heading, body, caption) as the deck uses them.
- The **standard look** (fingerprint) of a slide in this deck: background, title position/size/colour, fonts, decor elements present. Used to make new slides match and to check they do.
- Slide list: number, kind (normal / Morph template / own template), layout, title, point counts, pictures, locked, hand-edited.
- Conversation memory: the last 3 goals and what they touched ("the thank-you slide I just added").

**Sent only for the slides the message is about (slide detail)**
- Every object: type, role, text (short), colour, size, position, which parts are coloured differently (accent words), pictures and overlays.
- Capacity: how many points each list can hold in this layout, and which layouts could hold more.

Rules: names, not ids, go to the model; code maps them back. Content of slides is data, never instructions (prompt-injection safe, as today).

---

## 5. The catalogue: what users can ask (single source of truth)

Each entry is code (`assistant/catalogue/*.ts`) with: **id · how people say it (real phrasings, typos and Hinglish included) · slots · scope rule · DONE WHEN (acceptance criteria) · feasibility limits · when to ask · what to say when it cannot**. From this one list we generate the model's examples, the help answer, chips and the test set. Below is the first version (to be extended from real chats every week).

### 5.1 Text and content
| id | People say | Done when (checked by code) | Ask / can't |
|---|---|---|---|
| text.rewrite | "rewrite slide 7", "edit the last slide content", "please edit 11 number slide content", "improve the text" | the slide's words changed, same layout, every figure kept, no new figures | if the slide is locked/hand-edited: say so |
| text.expand | "add more content in the 2nd slide", "add more data please", "add detailed info here", "add the content from yourself" | at least 20% more words on that slide, within its capacity; new facts are general (no invented numbers; numbers only from the deck/sources) | slide full → offer a layout that holds more, or a second slide |
| text.shorten | "make slide 3 shorter", "less text", "too wordy" | fewer words (≥10% less), every figure kept | |
| text.points | "add 2 more bullet points", "add 2 more in both side", "add 5 points total in timeline", "remove the last point" | the exact count per list (+N, or total N) | capacity < asked → BEFORE changing: "The timeline holds 4 points. Switch to a process layout that fits 5?" |
| text.replace | "change the title to Our Vision", "rename the heading" | that text equals the person's words | |
| text.tone / translate / grammar | "make it professional", "translate slide 2 to Hindi", "fix spelling" | words changed in the asked way (language detected for translate), layout same | |
| text.notes | "add speaker notes to every slide", "write a script for slide 4" | notes written on exactly those slides, slide words untouched | reply says "notes", never "rewrote the text" |

### 5.2 Text look (typography)
| id | People say | Done when | Ask / can't |
|---|---|---|---|
| type.color | "update the text color to red", "make text off white", "make the title on slide 1 red" | EVERY text part in scope has that colour, including coloured accent words; theme and backgrounds unchanged | Scope: selection, else the named role/slide, else the **whole deck** (owner to confirm, section 12) |
| type.size | "make the title bigger", "increase the font size of the body text", "set the heading to 40", "update the text size" | sizes moved in the asked direction (relative to NOW) or equal the number given; nothing overflows or overlaps after reflow | "update the text size" with no direction → ask: [Bigger] [Smaller] [Set a size] |
| type.font | "change the fonts style", "use Poppins", "change fonts to professional", "font moneto" | fonts are the asked/selected pair | unknown font → "I don't have 'moneto'. The closest are Montserrat and Monoton: pick one" (buttons) |
| type.style | "make all titles bold", "center the title", "uppercase headings", "more line spacing" | the property is set on every target | already so → "Nothing needed changing: the titles are already bold" |

### 5.3 Colours, theme and design
| id | People say | Done when | Ask / can't |
|---|---|---|---|
| theme.mode | "make theme dark", "make theme light", "make the dark theme of environment" | ≥90% of slides show the new mode, colour family kept (or the one asked), text readable | Morph deck: say before what will and won't change |
| theme.palette | "color should be brown", "change color of theme to environment color", "green color is not good, update it" | the named colour family is in the deck colours, the rejected one is gone, words unchanged | |
| theme.accent | "change the accent color to blue" | accent is that family, other colours unchanged | |
| theme.design | "make it minimalist", "make it look premium", "use another template" | design changed; **every picture and every word kept** | a design that would drop pictures is not chosen |
| background | "make the background of slide 2 black", "change the background color of thank you page to same as other slides", "gradient blue to purple" | that slide's background is the asked one; its text readable | |
| revert | "didnt like it revert it please", "undo that", "go back" | the deck looks exactly as before that change | nothing to undo → say so |

### 5.4 Slides
| id | People say | Done when | Ask / can't |
|---|---|---|---|
| slide.add | "add thank you page", "add the thank you page at last", "add a slide about X after slide 5", "add 2 more slides", "add 4 more slides in between" | the slide(s) exist where asked, with real content about the topic, and **match the deck's standard look** (background, fonts, title style, decor, colours), text readable | "in between" with no place → ask with buttons (spread / after slide N) |
| slide.delete / duplicate / move / swap / lock | "delete slide 5", "duplicate slide 2", "move slide 3 to the end", "swap 2 and 4" | the order/slides are as asked | 3+ deletions → confirm |
| slide.reduce / merge / split / sections | "reduce to 6 slides", "merge 4 and 6", "split slide 5" | as today (confirm first) | |

### 5.5 Layout
| id | People say | Done when | Ask / can't |
|---|---|---|---|
| layout.change | "change slide 4 layout to two columns", "make it a timeline" | the slide has that layout, all words kept, no empty placeholders | content does not fit the layout → offer the closest that fits |
| layout.vary | "all 4 slides format is same so update all 4 slides format" | the named slides end with **different** layouts, content kept, no empty picture boxes | |
| layout.tidy | "make this slide less crowded", "improve hierarchy" | measurable: fewer words or more space, clearer size steps between title/heading/body | nothing to improve → say so with the reason |

### 5.6 Pictures
| id | People say | Done when | Ask / can't |
|---|---|---|---|
| pic.add | "add a picture to the title slide", "add best image in this first slide background related to clean india", "add images here in the ppt" | a matching picture is on each asked slide (free stock photo by default); **existing pictures untouched** | "generate" / "AI image" → AI picture with its cost confirmed |
| pic.replace / replace_all | "replace this image with a better one", "replace all pictures" | the picture changed in place, same frame; all → every picture changed, none lost | all → confirm |
| pic.shape | "make this image a circle", "update the shape of this image" | the shape is set, the photo is the same | no shape named → ask: [Circle] [Rounded] [Hexagon] [Arch] |
| pic.size / move | "make this image bigger", "move the picture to the left" | moved/resized **and the slide reflowed** so nothing overlaps or leaves the slide | cannot fit → say so, offer the layout with the picture on that side |
| pic.overlay | "image is not visible clearly because of overlay please fix it" | the overlay over that picture is lighter/removed on that slide only | |
| pic.cutout | "remove the background from this coffee image" | the picture now has a transparent background (on all template scenes that show it, said as such) | not their own picture / not available in production → say so |
| pic.remove | "remove the image from slide 3" | the picture is gone, the slide reflowed | |

### 5.7 Objects, tables, charts, animation, transitions
Kept from today (shapes, tables, charts, animations, transitions, groups, triggers), each moved into the catalogue with its "done when". Example: "add statistics to slide 4" is **text.expand with figures**, which needs data: "I can only use figures from your deck or a document you attach. Attach one, or tell me the numbers."

### 5.8 Conversation and out of scope
| id | People say | Behaviour |
|---|---|---|
| chat | "hii", "hey", "thanks", "bro" | friendly one line + 3 example things to try; no credits |
| help | "what can you do?" | generated from the catalogue and the plan |
| review | "review my deck", "what is wrong with my slides" | code-built report, nothing changed |
| question | "how many slides do I have?", "what is slide 3 about?" | answered from Deck Knowledge |
| complaint | "you have changed the theme of whole ppt", "why you changed the theme?", "thank you text is not visible" | explain what the last change did, offer [Undo it] and the fix; never "I couldn't change anything" |
| unknown | anything the catalogue does not match with confidence | "I'm not sure what you want me to change. Did you mean …?" (top 2 catalogue matches as buttons) |
| unsupported | "add a video", "give me some water", "export to pdf" | "I can't do that: … . Here is what I can do: …" — nothing changed, no credits |

---

## 6. Goal and acceptance criteria (the heart of the fix)

The understanding step returns `{ intent, slots, scope }`. **Code** (not the model) turns it into a Goal: a list of checks over the deck before/after, from the catalogue entry. Examples:

| Request | Goal checks |
|---|---|
| "update the text color to red" (no scope) | for every slide, every text run: colour ≈ red · theme colours unchanged · backgrounds unchanged |
| "also add 5 points total in timeline" (slide 4) | slide 4 list count = 5 · layout = timeline (or the offered one) · other slides unchanged |
| "add thank you slide" | 1 new slide at the end · says thank you · background = deck standard · fonts = deck fonts · title style = deck standard · readable |
| "increase the font size of the body text on slide 4" | every body run on slide 4 larger than before · no overflow · no overlap |
| "move the picture to the left" | picture x smaller · no overlap with text · inside the slide |

Each check result is `met | not met (why) | not applicable`. The reply and the money follow these results. The existing `evaluate` (editor + server on the saved deck) is reused; only the source of the checks changes from "the plan" to "the goal". Plan-level checks stay as an extra safety net.

---

## 7. Feasibility and honesty decision table (before anything changes)

| Situation | What the AI does |
|---|---|
| Intent clear, all checks can be met | Act |
| Intent clear, can be met only partly (capacity, locks, 60-object cap, plan) | **Do not apply yet.** Say what can and cannot be done, offer the real options as buttons ("Add 4 now", "Switch to process layout (holds 6)"). Caps are removed or work in batches; nothing is cut silently. |
| Two very different readings | One short question with buttons |
| Missing value that changes the result ("update the text size") | One question with buttons |
| Request needs data we don't have (figures, statistics) | Say so, ask for numbers or a document; may add general wording without numbers if the person agrees |
| Not in the catalogue / not supported | Plain "I can't do that" + what it can do |
| After applying, a goal check is not met | Roll back that part, reply "Partly done: … I could not …, because …" (or "Couldn't"), refund by the existing rules |

---

## 8. Executors: doing the work properly

- **Design inheritance.** Every new or rebuilt slide is composed from the deck's **standard look** (Deck Knowledge), not from defaults: same background, fonts, title style, decor, palette. A check compares the new slide's fingerprint with the deck's.
- **Typography on every part of the text.** Colour/size/style apply to all runs, including accent words with their own colour; sizes are relative to the current size; a size change reflows the box so the text fits.
- **Layout-aware geometry.** Move/resize goes through the layout engine: other objects make room (or the layout switches to "picture left/right"); if no clean result exists, it is refused with the reason. No more "it now overlaps".
- **Pictures are never lost.** Design changes and "replace all" keep a picture on every slide that had one; "add pictures" fills only slides without one.
- **Capacity-aware writing.** The writer gets the exact target ("exactly 5 points", "+25% words") and the capacity; code checks the result against the goal and retries once with the exact reason.
- **No caps that cut silently.** The 60-object limit becomes batching (or a clear limit said BEFORE acting).

---

## 9. Quality guards (after executing, before applying)

Run on the result of every request: overlap between objects that did not overlap before · objects off the slide · text overflow · contrast below 3:1 · pictures lost · design fingerprint drift on slides not asked about · any change outside the goal's scope (Morph template scenes are recognised as part of the goal, not "unasked"). A failed guard is auto-fixed when safe (reflow, readable colour), otherwise that part is not applied and the reply says so.

---

## 10. Reply composer

Built by code from the goal results, in the person's own terms:
- **Done**: "Done: made all the text red on all 10 slides."
- **Partly**: "Done on slides 1–8. Slides 9 and 10 are locked, so I left them."
- **Couldn't**: "I couldn't add a 5th point: the timeline holds 4. Want me to switch slide 4 to a process layout that holds 6?" [Yes] [No]
- **Nothing needed**: "Nothing needed changing: the titles are already bold." (never "I couldn't do that")
- **Can't**: "I can't add videos. I can add a picture or a link in the notes."
Slide numbers are the ones the person used ("duplicated slide 2 (the copy is slide 3)"). Notes are called notes. No contradictory notes (one rule decides each note).

---

## 11. "Training" and testing: how it gets better every week

We do not fine-tune a model. The AI "learns" through the catalogue and its examples, and every change is proven by tests:
1. **Example retrieval.** Each catalogue entry has 10–30 real phrasings (typos, Hinglish, short forms). For each message, the closest examples are put in the prompt (few-shot). The prompt gets shorter and more accurate instead of growing.
2. **Three test sets, run before every release:**
   - *Understanding set* (cheap, model only): every catalogue phrasing → the right intent, slots and scope. Gate: ≥95% per intent.
   - *Honesty set* (free, no model): every intent × deck variants (locked, full, Morph, own template) → never "Done" with an unmet goal. Gate: 100%.
   - *Live set* (real browser + real model, `e2e/ai-full-qa.mjs`): the 89 cases of 2026-11-21 plus one case per catalogue entry. Gate: 100% honest, ≥95% done.
3. **An intent is switched on only when it passes its gates** (as today's "ready only if covered by a scenario", but now with the goal checks).
4. **Weekly learning from real use.** Every reply records intent, confidence and goal outcome (no personal content beyond what we store today). Requests that ended as unknown, asked, couldn't or partly are reviewed weekly; new phrasings become examples, new needs become catalogue entries.

---

## 12. Build plan

Each phase ends only when its gates pass and the full live set is re-run.

| Phase | What | Exit criteria |
|---|---|---|
| **P1 Truth floor** | Goal checks for the existing actions (section 6) replace plan-only checks; feasibility before acting (capacity, caps, locks); reply composer rules (section 10); remove silent caps. | Live set: **zero false "Done"** (today 13). |
| **P2 Deck Knowledge** | Section 4 (design tokens, standard look, slide detail, conversation memory) in the understanding and writing prompts; design inheritance for new slides. | thank-you/new slides match the deck in 100% of runs; typography cases pass. |
| **P3 Catalogue + understanding** | The catalogue (section 5) as code; example retrieval; unknown/complaint intents; generated help and chips; understanding set ≥95%. Replaces `FAMILY_GUIDE`/`ELEMENT_GUIDE` prose. | Understanding set ≥95% per intent; live set ≥95% done. |
| **P4 Executors + guards** | Layout-aware geometry, all-runs typography, picture preservation, capacity-aware writing (section 8); quality guards (section 9). | No broken slides in the live set (overlap, off-slide, lost pictures = 0). |
| **P5 Learning loop** | Telemetry, weekly review screen in admin, catalogue growth process. | First weekly review done with real data. |

**What is reused, not rewritten:** the editor apply/undo path, `evaluate` and server settlement, the registry, the confirm flow, the capabilities' executors (extended), the scenario harness, the review, the live QA harness.

### Decisions needed from the owner
1. Approve this architecture and the order P1 → P5.
2. "update the text color to red" with nothing selected and no slide named: **whole deck** (what real users meant) or current slide?
3. "add more content / add more data" with no document: may the AI write **general wording from its own knowledge** (never figures it cannot source)? Recommended: yes.
4. Default for "add a picture": **free stock photo** (no cost, instant), AI picture only when the person says generate/AI. Recommended: yes.
5. When a request can only be done partly: **ask first** (recommended) or do the part that fits and say what is left?
6. Hinglish/Hindi phrasings in the catalogue from day one? Recommended: yes (real users write "add 2 more in both side", "at lat", "11 number slide").
7. Cost: Deck Knowledge adds about 300–800 tokens per request on the cheapest model (well under one credit). OK?

---

## Build record

### W0 Slice 1: request goals ("done when") — built and verified 2026-11-21
**Owner decisions applied:** whole-deck default for unscoped text colour (slice 2), "add more content" without a document = general wording, never invented figures; ask first when only part can be done.

**Built**
- `packages/validation/src/capacity.ts` (one source, read from `slideContentSchema` via JSON Schema): `pointLists` (the lists a person means by "points", with their real min/max), `contentWords` (visible words, not notes or picture fields), `textGoalFit` (BEFORE writing: can the slide hold it), `textGoalProblem` (AFTER writing: what is not met). Goal = `addPoints` (N more), `totalPoints` (N in all), `length` (longer ≥ +15% words / shorter ≤ −10%).
- Understanding: `text` values gained `totalPoints`, `length`, `notesOnly`; "add more data/content" without a document is text, never enrich.
- Writer (`capabilities/writing.ts`): gets the exact goal per slide (point counts, word target, lists that may take new points). The old rules "lists of steps/cards keep their length" and "if the limit stops you, add what fits" are gone. A slide is accepted only when its goal is met (one retry with the exact gap). Notes-only: the writer supplies only the notes; code places them on the untouched slide.
- Ask before writing when a slide cannot hold the request ("this timeline slide holds at most 6 points. Nothing was changed. Shall I make it 6?").
- Pipeline: what a capability's check still finds unmet after the retry is **withheld** (not applied, not claimed) and said plainly (`withhold`, `Unmet`).
- `keepShape` (compile) trimmed step/card lists back to their old length, silently undoing "add a 5th step"; edits now carry `lists` (the lists the goal may change, set by code), every other list still keeps its length.
- Chained new slides: a withheld new slide hands its place to the ones after it (they used to fall to the end).
- Layout: a picture layout is refused for a slide with no picture (empty picture boxes).
- The confirm payload type lives once (`Restructure` in validation); the API client and the panel no longer copy it.

**Verified:** live real-model QA on the real users' decks: R10, R11, R24, R25, R28 (step 1), R30, R38, R39, C01, C02, C18, C32, C44 pass on the saved deck. Unit: assistant+AI 249, scenarios 259, goals 8, keepShape guard; typecheck clean; prompt guard (3,500) kept by trimming wording.
**Moved to later slices (found here):** C18 says "Rewrote the text" for notes (slice 5); "N changes" header when fewer than asked were added (slice 5: Partly done); model variance: "add more content" sometimes not marked longer, "after slide 6" once read as end, "format is same" read as "copy slide 7" (slice 3 catalogue); the dev Vertex understanding call hung 8–17 minutes despite a 60 s per-attempt timeout (slice 5: measure and cap).

### W0 Slice 2: check before changing — built and verified 2026-11-21
**Built**
- `Capability.preflight` (`capabilities/types.ts`, `Preflight`): what will be blocked (locked slide or object, hand-edited slide) and how much is doable, worked out WITHOUT running. Implemented by the writer (text, layout), objects (locked slides and objects), background, picture, transition and delete (`capabilities/preflight.ts` `lockedSlides`).
- Pipeline FEASIBILITY stage before anything is authorised or run: animated-template refusals and every preflight are collected; when part is blocked and part is doable, the answer is a question: "I can do that for 64 objects, but not on slide 3 (locked). Nothing was changed yet. Shall I do the rest?" Nothing written or charged. "Yes, do the rest" sends a `proceed` confirm with the very same tasks (no model call; every task re-checked by `taskSchema`); a stale or tampered confirm is a plain refusal, never an error. Everything blocked: a plain reason, no question.
- The silent 60-object cap (`resolve.ts`) is gone: every object is changed; more than 400 is refused BEFORE anything changes, with the count and what to do.
- One template-slide rule (`templateSplit`) for the feasibility stage and the run.

**Verified:** live real-model QA: R01 and R02 now change all 77 text objects on all 10 slides (before: the first 60, slides 1–8, "Done"); new case R02L (slide 3 locked) asks first, then changes every other slide and leaves slide 3 untouched; regressions R09, R22, C06, C11, C13, C16, C29, C40 pass. Unit: 5 new slice-2 tests; scenarios now prove both steps of every partly-blocked case (259); full API 1,530, editor 567; typecheck clean.
**Moved on:** "Done — 64 changes" after a partly-done request must read "Partly done" (slice 5); C14 "center the title" says "already like that" for a left-aligned title (slice 4: the already-check is wrong).

### W0 Slice 3: understanding + design inheritance — built and verified 2026-11-21
**Built**
- **The catalogue** (`assistant/catalogue.ts`): 75 real phrasings (most typed by real users, typos kept) with their correct reading. For each message the 5 closest entries are shown to the understanding model (`examplesFor`, word overlap weighted by rarity, no model, bounded size); the always-sent guide stays under its guard (example lists for tidying and review moved out of it). Every entry is validated against `intentSchema` (a test), so an example can never teach a shape the model would be refused for. Entries needing a later phase carry `pending` (not shown as examples, not counted).
- **Real-model evaluation** (`scripts/assistant-eval-catalogue.ts`): every phrasing read with its OWN entry left out (understanding, not copying); targets compared by the SLIDES they mean (`resolveTargets`), not by how they are written; deck-wide families take no slides. Gate 95%.
- Guide rules for the genuine misses: a free stock photo ALWAYS unless the person says generate/AI/illustration; "two columns" = comparison; a mode with a colour or topic gives mode AND primary.
- **A design change never removes a picture** (`ComposeOptions.keepPhoto`): a picture a slide already shows is kept in a neutral composition when the new design has no photo style (Slate dropped the title and thank-you photos). Template decks unchanged (keepPhoto only for re-composition).
- **"Replace all pictures" never loses one and really replaces** (`generation/keep-pictures.ts`, `PictureRequest.avoid`): each slide's lookup skips the photo it shows now; a slide with no DIFFERENT match keeps its own (listed in the job report as `kept`), never turned into a text slide.
- **"Replace this image" with a picture selected** replaces THAT picture in its frame (`add_photo` placement `replace` + `elementId` → a verified swap, the same path as the person's own uploads), never a second picture on top; the reply says "with a new photo" (`picture_swap.source`), never "your uploaded picture".

**Verified:** real-model catalogue evaluation 57.4% → **98.7%** (74/75, own entry left out; remaining miss "add more data please" read as every slide, which then asks first). Live real-model QA on the real decks: R05, R31, R32, R43, R44 (free stock photos, previously only paid AI proposals), R12 (current slide), R28 step 2 (layouts really changed), R42 (dark + green), C10 (two columns), C20 (Slate keeps every picture), C36 (one picture, same frame, new photo), C37 (slides 3 and 8 new photos, 1 and 10 kept theirs, none lost), R20 regression. Unit: catalogue 6, design-keeps-pictures 2, keep-pictures 3, picture avoid 1, C36 scenario + end-state test; scenarios 261, theme 891, assistant 151.
**Moved on (slice 5):** tell the person which slides kept their picture after a refresh (the job report has it; the chat only says "On it"); "At most 2 photos can be added at once" is a limit said after the fact with a "Done" header (must be "Partly done", or asked first).

### W0 Slice 4: doing the work the way it was meant — built 2026-11-21
**Built**
- **One text-colour command** (`setTextColor`, editor `commands.ts`): the box's colour AND every coloured word in it (an accent word in a title). The toolbar's colour buttons and the assistant both use it, so "make the title red" and the red button do the same thing. The check (`alreadyAsked`) only counts a text colour as done when no coloured word kept another colour.
- **"Center the title" centres the TEXT** (`align` left/centre/right on a text box = its text alignment, like the toolbar's align buttons); the box stays in its column. A picture or shape aligned is still a move.
- **Text size has a direction** (`font_size.change: bigger|smaller`, set by the understanding model for "increase"/"smaller" with no number): a number that goes the other way is never used ("increase" can no longer make text smaller). A number the person gave is used as given.
- **Bigger text grows in its own place** (`sizeTextPlan`): the box only grows down when the text needs more height, and only into free room. A step ("bigger", "1.3x") takes the largest size that fits and says so; with no room at all, nothing changes and the reason is said.
- **Bigger objects grow into free room** (`growIntoRoom`): from the centre, a corner or an edge, never over another object; as far as fits (said), or refused with the reason.
- **A move onto other objects swaps places** (`makeRoom`): "move the picture to the left" on a picture-and-text slide puts the text on the right, in the place the picture left, when it fits there and nothing else gets covered. Locked or grouped objects are never pushed; with no room to swap, nothing moves and the reason is said.
- **"Anyway"** (`overlap: true` on move/resize/align): only when the person says to put it over other objects; then it is done as asked, with the overlap said.

**Unit:** theme 897 (6 new slice-4 tests), editor 575 (colour through the verified apply + toolbar command; scenarios center-title, increase-never-smaller, title-colour-all-words, and the multi-op case now refuses a centre move that would cover the body text), API 1,540.
- Placement uses the STRICT rule (`newContacts`: not one pixel on an object it did not touch before, and inside the slide margins where it was inside them), the same as new objects; the lenient overlap rule stays only for the overlap NOTE. (The first live run showed a picture grown over the last word of a bullet line: the lenient rule ignored the sliver.)

**Verified live (real model, real users' deck):** C03 title bigger (text grows in place, nothing covered), C05 picture moved left (title and bullets swapped to the right, nothing covered: screenshot checked), C14 centred text, C27 and C38 accent words take the colour, C30 body text bigger (was smaller). **C04 "make this image bigger"** on a picture-and-text slide whose picture already fills its column: now refused with the reason (it would cover the title and the text) instead of covering the text. Honest, but not the result a person wants: the real fix is a layout-level "give the picture more room" (widen the picture column, reflow the text), planned for W1.

### W0 Slice 5: replies that say what really happened — built 2026-11-21
**Built**
- **Every note has a kind, decided where it is written** (never guessed from its words): `refused` (a part of the request NOT done, with the reason), `already` (a part that needed nothing), or info. Capabilities return them in `Step.refused` / `Step.already`; the compiler (`compileAssist`) and the pipeline's own gates do the same; the route passes `refused` and `already` to the editor next to `notes`.
- **The headline follows the kinds** (`compose` in theme `claims.ts`, `nothingChangedReply` in `assistant/replies.ts`):
  - something done + something refused = "Partly done — …, but I couldn't do one part of it";
  - nothing done + refused = "I couldn't do that";
  - nothing done, everything already so = "Nothing needed changing" (C13, C16, C26).
- **Slide numbers are the ones the person named** (C07, C08): "Duplicated slide 2 (the copy is slide 3)", "Moved slide 3 (now slide 10)" (`from` on the duplicate/move expectations).
- **Speaker notes are said as notes** (C18): the notes-only comparison is key-order-insensitive (the server's sanitiser writes keys in its own order, so notes-only edits were read as rewrites).
- **"Remove the image" on a picture + text slide** (C43): one promise (the layout switch), worded "Removed the picture from slide 3 (the words stay, in a text layout)"; no second "clear pictures" step that then reported "had no picture to remove".
- **Cut-out of the selected picture only** (R17b): "this image" means the selected picture; the template rule that changes the same picture on every Morph scene is no longer reported as "something else changed" (`sceneSlidesOfPicture`, one rule shared with the note).
- **No "Done" without a visible change** (R15): new colours on a deck whose every slide is an animated-template scene are asked first ("only slides you add later … change anyway?").
- **Refresh report** (C37): after "replace all pictures" the editor says which slides kept their own picture (job report `keptSlides` → `quality.picturesKept`).
- **The "hang" measured, not patched**: 4,094 understanding calls in 3 days averaged 2.3 s; the 5 calls of 8–17 minutes were consecutive single attempts at night, in a ~16-minute rhythm (a sleeping laptop's wake cycle: Node's timers stop counting while the machine sleeps, the wall clock in the log does not). Not a gateway bug; servers do not sleep. Re-measure on OpenRouter before launch (already on the checklist).

**Unit:** theme 905 (replies.test: headlines by kind, slide numbers, notes, picture_off, Morph scenes), API 1,543 (replies.test; template deck asks first), editor 575 (27 scenarios now expect "partial" / "already" where a part was refused or already so).
- "Already so" is said once per kind of object, with all its slides ("The title on slides 1 to 10 already is like that"), never one line per slide (scenario `element-already-all-titles`).

**Verified live (real model, real users' decks):** R02L (asks first, then "Partly done … couldn't do one part"), R17b (cut-out of the selected picture, no contradictory notes), C07 "Duplicated slide 2 (the copy is slide 3)", C08 "Moved slide 3 (now slide 10)", C13 and C16 and C26 "Nothing needed changing" (C13 in one line), C18 "Wrote the speaker notes of slides 1–10", C43 "Removed the picture from slide 3 (the words stay, in a text layout)", C37 the editor says "Slides 1 and 10 kept their own picture: no different match was found" (screenshot checked), R15 asks first on the all-template deck (the harness counts the question as a miss; it is the intended behaviour). Still open: C04 (layout-level "give the picture more room", W1).
**W0 complete.** Unit at close: theme 905, editor 575 (scenarios 265), API 1,543; typecheck clean; editor lint 0 errors.

### W1 Slice 1: text formatting + room for a bigger picture — built and verified 2026-11-21
**Built**
- **Text formatting from words** (`text_style` in `packages/theme/src/assist/element-ops.ts`, `textFormat`): underline, place in the box (top/middle/bottom), line spacing, letter spacing, paragraph spacing, weight, case, bullets/numbers, fit. The model picks a WORD ("looser", "bolder", "title") or passes the person's own number; code turns words into numbers relative to the text as it is NOW (line spacing ±0.2/0.15 from 1.3, paragraph gap ±0.3/0.25 from 0.5, letter spacing by the size, weight ±200 from the role's weight). All of these fields were already drawn by the renderer and written to PowerPoint, so nothing the assistant sets is invisible or lost on export.
- **Case without a model writing words** (`caseParagraphs`): capitals and "normal" are a display setting; lower, sentence and title case change only the letters of the person's own words, keep acronyms ("AI", "NASA"), keep every run's own look (an accent word keeps its colour), and skip small words in title case.
- **Fit**: "make it fit" shrinks the size until the text fits its box (never below 60% of its size: then refused with what to do); "box to its text" sizes the box to its text, growing only into free room. Already fitting is said, not "done".
- **"Already so"** covers every new field; underline is applied with the editor's own run command; new words go in before a colour asked with them, so the colour reaches every word.
- **C04, the picture that fills its column** (`growSideways`): when a bigger picture has no free room, the text boxes beside it give up width (the picture column gets wider), only from one side, never locked or grouped boxes, only while their text still fits at its own size (the overflow estimate) and they keep 60% of their width; otherwise refused with the reason, as before.
- Catalogue: 6 new real phrasings route to object changes; 5 new scenarios through the whole pipeline.

**Verified live (real model, real deck):** W01 line spacing on slide 4, W02 subtitle title case (only the letters' case changed), W03 numbered list (words unchanged), W04 underline, W05 vertical centre, **C04** (picture 832 → 1047 wide, title and bullets narrowed and re-wrapped, nothing covered: screenshot checked; the harness check now knows a filling picture is cropped by a wider frame, not stretched), regressions C03, C05. Unit: theme 906 + 4 W1 tests, editor 581 (scenarios 270), API 1,543.

### W1 Slice 2: selection and layers — built and verified 2026-11-23
**Built**
- **Objects named the way people name them** (`resolveElements` in `assistant/resolve.ts`): by the words on them ("the box that says Revenue"), by colour family (text colour, coloured words, shape fill; very dark navy counts as black, `sameColourFamily`), the largest/smallest (of a type), the decorations, the hidden objects, every object. A reference that names a SET is never answered with "which one?".
- **Select** (`op: select`): the editor goes to that slide and selects exactly the objects code found; nothing in the deck changes, so it is free (`selectObjects` in the answer).
- **Layers**: one layer forward/back, behind/in front of a named object (`planLayer`, `placeNextTo`). "Forward" is planned as "in front of the object just in front of it now", so every layer change is ONE fact the check reads from the deck afterwards. Template (Morph) scenes are never re-stacked.
- **Lock / unlock, hide / show, rename** with the Selection pane's own commands. A locked object is what unlocking is ABOUT (not blocked, not asked about). A name must be the person's own words (in their message), never the model's.
- **Deleting 3 or more objects asks first**, counting only what can really be deleted.
- **Design-locked decorations**: layouts lock their accent shapes themselves (so a click never grabs them); when the person names the decorations, that lock does not stop a delete, hide or show. Anything a person locked is still respected.
- Understanding: "lock the picture" is an object lock, "lock slide 3" a slide lock (guide + catalogue); 8 new real phrasings.

**Verified live (real model, real deck):** W10 select (free, nothing changed), W11 picture behind the text, W12 lock the picture (first run read it as "lock slide 1": fixed), W13 hide the subtitle, W14 rename to "Product Image", W15 delete the decorations (asked first; first run asked and then said "locked": fixed), regressions C05, C13. Unit: theme 912 (layers/lock/hide/name), API 1,549 (+6 resolver tests), editor 594 (scenarios 283: select, lock, unlock locked, hide, show hidden, rename own/not own words, behind, backward, delete-many ask + confirm, design-locked decorations).

### W1 Slice 3: brand colours, own uploads, Ask → Edit, timed scripts — built and verified 2026-11-23 (W1 complete)
**Built**
- **Colours by word** (`capabilities/colour-words.ts`, one rule for text, shape fills and slide backgrounds): a deck colour ("primary", "accent", "the text colour") stays a TOKEN where the object can keep one, so it follows the deck when its colours change; a background gets the colour itself. "Our brand colour" (`brand_primary` / `brand_accent`) is read from the person's SAVED brand kit; on a plan without brand kits, or with no saved colour, the reason is said and nothing is guessed.
- **The person's own uploads on any slide**: "put my product shot on slide 2" replaces the picture there, or, on a slide with no picture yet, ADDS it (placed and checked like a found photo; where the slide cannot take it beside the text it floats, and that is said).
- **Ask → Edit hand-off**: a change typed into Ask ("make the theme dark") is not answered there and costs nothing; the answer offers "Do it in Edit", which switches tabs and sends the same words.
- **Timed speaker-note scripts** (`notesSeconds`): code turns the time into a word range at a normal speaking pace (140 words a minute, ±20%); the writer is given the target, a script outside it is sent back once with the exact gap, the reply calls the length an estimate. The timing travels through the many-slides confirm.
- **Wording fix found on the way**: a colour change on a template deck read "Applied the Custom colours design" (dropping the template link was counted as a design change); now "Changed the colours and dark mode of the whole deck".

**Verified live (real model, real deck, real browser):** W20 title in the accent colour (a token, coloured words cleared, theme unchanged), W22 30-second script (62 words, slide words unchanged, estimate said), W24 own upload added to a slide without a picture, the Ask → Edit hand-off clicked through in the browser (0 credits for the Ask turn, the deck turned dark, corrected wording checked on the screenshot), regressions C18, C27. Not run live: "our brand colour" (needs a saved brand kit on the test account): covered by unit tests and scenarios. Unit: theme 913, editor 600 (scenarios 289), API 1,554 (+colour words, timed script, Ask hand-off route test).

### W2 Slice 1: pictures (crop with vision, copy a look, the colour wash) — built and verified 2026-11-23
**Built**
- **Crop** (`op: crop`, `planCrop` in `packages/theme/src/assist/element-ops.ts`): to a shape (16:9, 4:3, 3:2, 1:1, 9:16, 3:4, 2:3), to a side (left/right/top/bottom), to the SUBJECT the person names, or back to the whole picture. Every number is worked out by code from the picture's own shape; the editor applies it with the Crop dialog's own command (which sizes the frame). A crop to a subject keeps the frame's shape, so the layout does not change; a crop to a ratio that makes the frame taller is refused when it would cover other objects. Template (Morph) pictures are never cropped.
- **The vision step** (`assistant/vision.ts`): one small call per picture finds the subject; the model reports a box in the form vision models are trained on (`box_2d`, [ymin, xmin, ymax, xmax] on 0-1000), code turns it into fractions and makes it safe. Not found, already filling the picture, or a vision call that fails = said plainly for that picture, never a failed request. At most 6 crops per request.
- **Which pictures may be read** (`media/deck-picture.ts`): the person's stored pictures, our template pictures, and the free photos our decks link to on `images.unsplash.com` (https only, through `safeFetch`, size-limited); never any other address. (Most generated decks link their photos to Unsplash: without this, crop would refuse on most real decks.)
- **Copy a look** (`op: copy_look`, `planCopyLook`): pictures (shape, corners, light, shadow, wash), shapes (fill, gradient, outline, corners, see-through), text (colour, weight, spacing, case, alignment); never words, place or size; only between objects of the same kind; `fromSlide` for "like the picture on slide 1"; "make all the pictures look like THIS one" leaves the selected one alone and is never silent.
- **The colour wash over a photo** (`picture_style.overlay`: lighter / darker / none): the two real "overlay" phrasings in the catalogue are no longer pending.
- **Own uploads only from the person's own words**: a picture swap with one of their uploads needs "my / our / uploaded" in their message; otherwise it is a new free photo (a C36 regression the slice-3 guide wording had caused). Cropping is no longer listed as unsupported.

**Verified live (real model, real decks):** W30 square crop, W31 crop to the ink bottle (real vision step: centred on the subject, frame shape kept, screenshot checked; first runs found the 0-1 box format wrong and the open book really filling the photo), W33 copy the look from slide 3 to slide 8, R33 (real user: overlay taken off, photo clear, title still readable, wording "Took the colour wash off the picture on slide 1"), C36 regression fixed. Known limit: a tight crop of a small linked photo looks soft (the deck links a smaller copy of the photo). Unit: theme 919, editor 611 (scenarios 300), API +box/address tests. Unrelated flaky test noticed: `security/auth-abuse.test.ts` "30 sign-ups at the same instant" sometimes refuses the one sign-up after the burst (the limit itself always held).

### W2 Slices 2-3: shapes, charts, tables, plan preview — built and verified 2026-11-24 (W2 complete)
**Built**
- **Every shape of the editor** (the basic kinds + the 45 library shapes, one list: `SHAPE_PATH_IDS`; words from the library's own labels). **Shape kind** (`shape_kind`, "a PERFECT circle" = equal sides around the same centre), **rotate** (to or by an angle), **sizes from other objects** (`match_size` "as big as the picture", `same_size` "make these the same size": done as a resize, so it only grows into free room), **rows of equal shapes** (`add_shape.count`, `planShapeRow`: one size, equal gaps, the whole row in free room or refused).
- **Charts**: legend (hide/bottom/right/automatic), trend line (bar/line only), the figures on the marks, one series' or slice's colour (`chart_style`); a new series or item with the person's own figures (`chart_add`); a NEW chart from figures the person typed (`add_chart`, `planNewChart`, in free room). Every figure must be in the person's message (never made up). Chart styling is off the "not supported" list.
- **Tables**: text size bigger/smaller/exact (`table_font`).
- **One chart colour list** (`deckChartColors`) for the screen, the PowerPoint export and the assistant: the export used a different list, so a chart with 4+ series changed colour in the file (found while building this).
- **Plan preview**: three or more separate changes in one message are listed first in the person's own words and confirmed ("I'll make these 3 changes: … Go ahead?"); nothing runs or is charged before; the confirm carries the same tasks and any part left for the next step.
- **Objects named by colour**: colour NAMES ("blue") and named hue ranges (a darker #0056B3 is still blue, teal is not); "the big blue box" narrows colour + type + size TOGETHER to one object (the first live run turned the title and every blue shape).
- **Separate tasks for different changes on different objects** (guide rule + catalogue example): "title red, subtitle underlined, picture a circle" did only the title.
- Reply: a sentence with two object places reads "… and showed the figures on it".

**Verified live (real model, real deck):** W40 yellow square → perfect circle, W41 only the big blue box turned 5°, W42 three equal cards in free room (screenshot), W43 a heart, W50 legend hidden + figures shown, W51 series "2025" with the typed figures, W52 a bar chart from typed figures (screenshot), W53 the plan preview then all three changes. A full slide (picture + full-width title and subtitle) honestly refuses a row or a chart ("no free room"). Unit: theme 923, editor 628 (scenarios 317), API 1,558+.

### W3: animation and transitions — built and verified 2026-11-24
**Built** (every animation change is an effect plan on the ONE verified path: the editor applies it with its own effect commands, `effectAlready` checks it on the deck)
- **The full effect catalogue** in the guide, generated from `EFFECTS` (29 effects + motion paths; the guide had 20 typed by hand). **Rewind** (`rewind` → the effect's `reverse`).
- **Remove by kind or by place**: `animate_clear.kind` (only entrance / emphasis / exit), `animate_remove_at` ("remove the 3rd animation", from the slide's own play order).
- **Start all automatically**: `animate_start` (all of an object's animations start on a click / with / after); objects named as a set that have no animation are simply not part of it.
- **A whole play order in one go**: `animate_sequence` ("title, then subtitle, then picture"; a name that matches several objects takes its place together).
- **Animation Painter**: `copy_animation` from another object, another slide (`fromSlide`), or slide to slide (object by object, same kind and text role, in order; objects with nothing to match are skipped quietly).
- **Transitions**: the person's exact time (`seconds`), "the same as the previous slide" (`like: previous`), and changing many slides KEEPS Morph where a slide has it (said, unless the person named Morph).
- **Morph sequences** (composition, nothing new to trust): duplicate the slide (the copy keeps every object's id, which is what Morph pairs), Morph on the copy, then the object change on the copy, chained with `added_by_task`. Object references now see slides added in the same message. **All or nothing** without the Morph plan (never a copied slide without the Morph that was the point).
- **Plan preview lines** use the person's words only when every part has its own clear phrase; otherwise each task is described by code ("duplicate slide 3", "use Morph on the new slide", "move left on the new slide").
- "All the objects" no longer includes the design's own decorations (named on their own: "the decorations").

**Verified live (real model, real deck):** W60 fly in + rewind, W61 only the emphasis animation removed, W62 all of slide 2's animations start automatically (first run asked about the layout's locked decorations: fixed), W63 slide 2's animations painted onto slide 5's title, W64 a fade of exactly 1.5 s, W65 Morph sequence (copy made, picture left / text right on the copy, Morph on it: screenshot checked; preview wording fixed). Unit: theme 923, editor 641 (scenarios 330), API 1,559.

### W4: brand, collaboration and workflow — built and verified 2026-11-24
**Built** (none of these change slides, so they need no verifier: `changesNothing` in META; credits are refunded for each)
- **Workflow** (`workflow` family): present (from slide N or the current slide), export (pptx / pdf / png / jpg / html, only the plan's formats), share / invite with the email the person typed. The assistant never does these itself: the reply carries a `ui` action and a button ("Export as PDF", "Present from slide 3", "Open Share"); Share opens with the email filled in and nothing is sent until the person presses Invite (owner decision). Present takes `?slide=N` (clamped to the deck).
- **Saved brand kits** (`brand_kit` family, Gold+ only, owner of the deck only): create, change (colours, fonts, name), delete, make default. ALWAYS shown and confirmed first ("Create a brand kit "Nova" with main colour #1E3A8A, second colour #EAB308. This changes your saved brand kits, not this deck. Go ahead?"; owner decision "strictly with confirm steps"). Name and colours must be the person's own: a kit name the model made up is refused; colour words map to one shade each; a code nobody typed is refused, but a code the model turned a colour WORD into ("navy" → #000080) maps back to that word (found live).
- **Confirms read the person's words from before "yes"**: a proceed confirm is re-checked against everything the person wrote in the conversation (`personsWords`), not just "Yes, go ahead" (found live: every "own words" check failed on confirm). The compile step uses the same words.
- **Kits by name** ("use my Acme kit": exact name, else the one containing it, never a guess), **brand review** ("which slides break my brand?": colours and fonts outside the kit, per slide, nothing changed).
- **Comments** (`comment` family): add on a slide (in the person's name, AI label), summarise, list unresolved, draft replies (as text, not posted), resolve (confirmed first). **History** (`history`): what changed since the last saved version, in words, with a pointer to History.
- **Ask → Edit hand-off**: an edit request in Ask is answered with "Do it in Edit".

**Verified live (real model, real deck):** W70 export as PDF (button), W71 present from slide 3, W72 Share with anna@example.com filled in, W73 kit "QA Nova" asked first then created (first runs: the model's #000080 refused, then the confirm lost the person's words: both fixed), W74 brand review of 10 slides against that kit, W75 comment added on slide 2, W76 changes since the last version. The test kit was deleted afterwards. Unit: theme 923, editor 665 (scenarios 354), API 1,559, lint 0 errors.

### W5 Slice 1: single words get their own style — built and verified 2026-11-24
**Built** (editor first, then the assistant; one rule everywhere)
- **One rule for how text is drawn** (`packages/validation/src/text-style.ts`: `textBaseWeight`, `runWeight`, `isRunBold`, `isRunItalic`): used by the slide, the inline editor, the toolbar, the assistant's checks and the PowerPoint export. Found while building: the export read only an explicit weight, so subtitles and headings that are bold on screen came out plain in the .pptx, quotes lost their italic, and "bold off" on a title word did nothing on screen.
- **The inline editor keeps each styled stretch of words** (`apps/editor/src/editor/inline-runs.ts`). It draws every run as on the slide and READS BACK what is shown (`readRuns`: whatever markup the browser makes, each piece of text gets the style it is drawn with), so typing never wipes per-word styles any more (before, the box was edited as plain text and styles were guessed back).
- **Word-processor behaviour**: words selected → only those words; caret inside a word → that word (caret stays put); caret between words → what is typed next. Ctrl/Cmd+B / I / U, Ctrl/Cmd+\ clears formatting. The browser's own editing commands do the change, so Ctrl/Cmd+Z inside the box, IME input and typing behave natively; closing the box is ONE undo step in the editor.
- **The text bar while typing** (`TypingBar.tsx`, replaces "Typing · Esc to finish"): Bold, Italic, Underline, Clear formatting, the 5 theme colours (kept by name, so they follow a theme change), 6 standard colours and any colour, plus Delete. Its buttons never take the caret out of the box. The toolbar of a selected box still acts on the whole box; its B / I / U show pressed only when EVERY word is drawn that way; italic off on a quote really makes it upright.
- **Not an edit when nothing changed**: `canonicalRuns` writes stored paragraphs the way the reader does, so opening and closing a box changes no revision and does not mark the slide hand-edited.
- **Assistant**: `text_style` takes `words` ("make revenue bold", "colour 2025 in the accent colour", "only the word Physics italic and red"). `styleWords` (shared) styles every whole-word place the words appear, leaves the rest of the box as it was, never writes a style the box already draws (a title word made "bold" is already bold), refuses words that are not in the text, and refuses box-only styles (spacing, alignment) for single words. Reply: `Made "Physics" italic and red (#FF0000) in the title on slide 1`.

**Verified**: real browser (17 checks: one word bold/normal by Ctrl+B, caret-in-word italic, title word un-bolded and accent-coloured from the text bar with the box staying open, native Ctrl+Z, clear formatting, typing after Ctrl+B, editor Undo, open/close is no edit, styles drawn after reload); PowerPoint XML per word (`pptx-word-format.test.ts`); live real model W80 (3 title words accent), W81 (Maxwell's underlined), W82 (Physics italic + red, screenshot), W83 (word not there → honest refusal, nothing changed). New permanent e2e check in suite 04. Unit: theme 928, editor 678 (scenarios 357), API 1,562, ui 128, lint 0 errors.
**Found, not changed**: suite 02-auth still expects sign-up to land in the editor, but sign-up now asks to confirm the email first, so 7 of its checks fail and suite 04's Starter Present check then runs on an account that is already Pro. Suite 04 now starts its element checks on a fresh copy of the template deck (the rail checks add empty placeholder slides that broke 4 text checks since 2026-11-18).

### W5 Slice 2: arrange — what is in front, and turning objects — built and verified 2026-11-23
**Before**: front/back already existed (right-click menu, Selection pane, assistant), but turning an object was only possible by asking the assistant, and a turned object looked broken in the editor: its outline, its click area and its handles stayed upright while the object was turned, and resizing it stretched it the wrong way. Charts and tables could be turned on screen but came out upright in the .pptx.
**Built** (one rule everywhere: `packages/validation/src/rotation.ts` — `canRotate`, `normAngle`, `visualBox`, `turnOf`)
- **Rotate handle**: a round handle under the middle of the selected object (under, so it never meets the toolbar above). Drag to turn; the angle shows live; it clicks onto upright and every 45° within 3°; Shift gives 15° steps. One undo step. Not shown for charts and tables (PowerPoint cannot turn them either).
- **A turned object behaves turned**: outline, click area, the 8 handles and their cursors turn with it; resizing moves along the object's own sides with the opposite side staying still on the slide (`resizeTurned`); moving snaps by the box it fills on the slide; typing in a turned text box happens at its angle.
- **Arrange in the object toolbar** (`ArrangePanel.tsx`, stays open like a ribbon tab): Front / Forward / Backward / Back (greyed when already there), rotate left/right 90°, the angle as a number to type, Straighten (greyed when upright). A whole group turns as one piece around its middle; a group holding a chart or a table is not turned (it would come apart), and the person is told why.
- **Keys** (PowerPoint's): Ctrl/Cmd+] forward, +Shift to the front; Ctrl/Cmd+[ backward, +Shift to the back; Alt+←/→ turn 15°, +Shift 1°. The right-click menu shows them and has Rotate right / left 90°. Every entry point calls `object-actions.ts` (one implementation).
- **Toolbars never cover their object** (`toolbarPlace.ts`): the object toolbar and the typing bar measure themselves and sit fully above the object (as seen, turned), else below it clear of the rotate handle. Found while testing: with a second row (Arrange or Picture open, or a narrow window) the bar covered the top of the selected object.
- **Charts and tables are drawn upright everywhere** (slide, editor, thumbnails, Present, .pptx), even when an old deck holds an angle on one. The .pptx writes turns as 0..360 (it wrote negative angles before).
- **Assistant**: `rotate` uses the same rule and arithmetic (chart/table → "charts and tables stay upright", nothing changed); layers unchanged.

**Verified**: real browser (14 checks: handle drag to a clean 90° with the live angle, handles/cursors turned, resize of a turned shape keeps its far side, Arrange angle box / +90 / Straighten, Alt+arrow and undo, Ctrl+Shift+[ and Front, menu turns, chart refused with a message, turned typing, toolbar clear of the object, reload); new permanent check in suite 04 (29/30, the one left is the stale suite-02 Starter check); .pptx XML (`rot="16200000"` for -90); live real model W84 (chart → honest refusal, nothing changed), W85 (straighten), W86 (to the front), W41 and W11 again. Unit: editor 693 (13 new), theme 929, API 1,563, ui 126 (the old "chart drawn turned" checks now check upright), lint 0 errors.

### W5 Slice 3: export one slide or some slides — built and verified 2026-11-23
**Before**: every export was the whole deck.
**Built** (one reader for a range everywhere: `packages/validation/src/slide-range.ts` — `parseSlideRange`, `compactSlides`, `describeSlides`, `slidesFileSuffix`)
- **Export menu** (`ExportMenu.tsx`): Slides — All (default), This slide (N), or typed ("1-3, 5", "8-", "2 and 4"); a wrong range is said while typing ("This deck has 11 slides, so there is no slide 14") and the formats grey out. Formats keep their names (PPTX, PDF, PNG, JPG, HTML) with a plain description. A line says what will download ("Downloads slides 1-3, 5, numbered as in the deck").
- **A slide's own menu** (rail): "Download this slide…" opens Export on that slide (owner only; a collaborator does not see it).
- **Files**: named after the part ("Deck-slide-7.png", "Deck-slides-1-3_5.pdf"); pictures in a zip are named by their own slide number; the footer keeps the deck's numbering ("07 / 12"), as the editor shows that slide. PPTX is built on the server from only those slides (`buildPptx(doc, load, { slideIds })`, Morph pairs with the slide before it in the file); PDF/PNG/JPG/HTML are rendered in the browser from only those slides.
- **Never a silently smaller file**: a slide that is no longer in the deck (deleted in another tab, or after the assistant prepared the button) → `SLIDES_GONE` (API) / a message (editor). The plan gate is unchanged (Starter cannot export one slide either).
- **Assistant**: `workflow.slides` ("3", "1-3, 5", "current"), read by the same reader; the button says "Download slides 1-3, 5 as PDF"; a slide past the end is refused with the reason. The understanding guide was kept inside its token budget (assistant.test.ts).

**Verified**: real browser (10 checks: menu choices, this slide as PNG, a wrong range said and formats greyed, "1-3, 5" as a 4-page PDF and a 4-picture JPG zip named by slide numbers, "Download this slide…" from the rail → one-slide PPTX, whole deck unchanged, toast names the slides, Escape / outside click); the assistant's button pressed in the browser → a 2-page "slides-2_4" PDF; suite 06 new check + all format checks pass (its 2 failures are the stale sign-up: sign-up now asks to confirm the email); API: one-slide PPTX with "03 / 04" footer and name, deck order, gone slide 422, Starter 403; live real model W87 (slide 4 PNG), W88 (this slide PDF), W89 ("1 to 3 and 5"), W70-W72 again. Unit: API 1,570, editor 696 (scenarios 362), theme 929, ui 126, lint 0 errors.

### W5 Slice 4: spacing of text (lines, paragraphs, letters) — built and verified 2026-11-23
**Before**: the deck, the slide, the PowerPoint file and the assistant all had line / paragraph / letter spacing, but the editor had no control for it.
**Built**
- **Spacing in the text toolbar** (`SpacingPanel.tsx`, `editor/spacing.ts`): line spacing by name (1.0, 1.15, Normal, 1.5, 2.0) and a fine slider; paragraphs and letters sliders; "mixed" when the selected boxes differ; Reset spacing (greyed when already normal). Works on every selected text box at once; a slider drag is ONE undo step; the deck's normal is stored as "not set" so the box follows the deck again.
- **"The text no longer fits its box" + Make the box fit**: the same estimate the assistant uses (`estimateTextHeight`), grown down only, never past the slide.
- **Found and fixed**: the estimate always used the default paragraph gap (0.5), not the box's own, so the assistant's "fit" and the new warning were wrong after a paragraph-spacing change (`MetricOpts.paraGap`).
- **Toolbars, second round** (`toolbarPlace.ts` `placeBar`, tested): with a tall panel open over a tall box there was no room above or below inside the slide and the bar covered the box. Now: above → below (past the slide into the free page, down to the floating dock) → right → left → only then the place that covers the least.
- **Assistant**: unchanged (`text_style` lineSpacing / paragraphSpacing / letterSpacing); live: "double spaced" = 2.0, the editor's 2.0.

**Open (needs the owner)**: the screen draws `lineHeight` as CSS (1.3 × size by default) while the .pptx writes `lineSpacingMultiple: lineHeight ?? 1.2` (PowerPoint's 1.0 = the font's own line height, about 1.15-1.2 × size). So text in the download is likely a little looser than on screen, and a box with no spacing set exports at 1.2 while one set to 1.3 exports at 1.3. Measuring it needs PowerPoint (installed on this Mac) to open a test file and save a PDF; the automation was blocked (it would have closed open presentations). Not changed until measured.

**Verified**: real browser (7 checks: panel values, 2.0 stored and drawn, slider = one undo step, overflow warning + Make the box fit, Reset, two boxes + "mixed", no errors); new permanent check in suite 04 (30/31, the one left is the stale suite-02 Starter check); live real model W90 (double spaced → 2), W91 (more paragraph space). Unit: editor 706 (spacing, placeBar), theme 930 (paraGap estimate), API 1,570, ui 126, lint 0 errors.

### W5 Slice 5: flip (mirror) — built and verified 2026-11-23
**Before**: no flip anywhere (editor, slide, PowerPoint file, assistant).
**Built** (one rule: `packages/validation/src/rotation.ts` — `canFlip`, `flipOf`, `transformOf`)
- **Data**: `flipH` / `flipV` on an object. Pictures and shapes only: a text box would mirror its words, and charts / tables cannot be mirrored in PowerPoint. The flip happens inside the object's own box before its turn (PowerPoint's order), so its box, handles, snapping and resizing never change.
- **Drawn the same everywhere**: one transform (`transformOf`) for the slide, thumbnails, Present, exports rendered in the browser and Morph (a Morph between a picture and its mirror image turns it over through its edge instead of jumping).
- **Editor**: Arrange → Flip Horizontal / Vertical (pressed when on; text says why it cannot); right-click Flip horizontal / vertical (greyed for text, charts, tables). As SEEN, like PowerPoint: a turned object's angle reverses (30° → -30°). A whole group mirrors as one piece: members swap sides, its pictures and shapes mirror, its words move but stay readable. One undo step each.
- **PowerPoint file**: `flipH` / `flipV` on the picture's or shape's frame together with its turn; never on text (also not on the placeholder words of a missing picture).
- **Assistant**: `flip` op (horizontal / vertical) with the same rule and arithmetic; text refused with the reason ("its words would read backwards (I can turn it instead)"); the "already" check knows the flip (an unknown field would have counted as already done).

**Verified**: real browser (7 checks: picture mirrored on the slide with its box unchanged, button pressed, flip again + undo, text refused with the reason and the menu items greyed, a turned shape flipped upside down reverses its angle and the handles follow, kept after reload and the thumbnail mirrored, the PowerPoint download has `flipH="1"` on the picture); new permanent check in suite 04 (31/32, the one left is the stale suite-02 Starter check); .pptx XML test (`flipH="1" rot="19800000"`, text never flipped); live real model W92 (picture flipped), W93 (title → honest refusal, nothing changed), W41 again. Unit: editor 713, theme 931, API 1,571, ui 126, lint 0 errors.

### W5 Slice 6: dashed and dotted borders and lines — built and verified 2026-11-23
**Before**: borders and lines were solid only. Found while building: (1) a border on a triangle, chevron or free shape was a CSS border on a clipped box, so on screen most of its outline was cut off while PowerPoint drew all of it; (2) the .pptx drew a line from the top-left to the bottom-right corner of its box (a slight slope) and at another thickness than the screen; (3) a gradient-filled shape lost its border in the .pptx; (4) importing a PowerPoint template turned dashed lines solid.
**Built** (one rule: `packages/validation/src/stroke.ts` — `dashArray`, `pptDash`, `dashFromPpt`; `strokeDash: 'dash' | 'dot'` on shapes, absent = solid)
- **Drawn along the shape**: a basic shape with a border (rect, ellipse, triangle, chevron, polygon) and a dashed line or ring are SVG, the outline centred on the shape as PowerPoint draws it; dashes in PowerPoint's proportions (dash 4 widths on / 3 off, dot 1 / 1, square ends). Shapes with no border keep their plain drawing.
- **Editor**: Solid / Dashed / Dotted (each button draws its own line) next to the border width, and next to a line's colour. One undo step each.
- **PowerPoint file**: `prstDash` dash / sysDot on borders, rings and lines; a line is straight through the middle of its box, as thick as on screen; a gradient shape gets its border on top of its picture.
- **Template import**: dashed and dotted lines and outlines stay so; only dash-dot kinds are approximated (the warning now says "Dash-dot lines are drawn as plain dashes").
- **Assistant**: `shape_style.dash` (solid / dashed / dotted); a shape with no border is refused with the reason ("say a colour for the border too") — never a made-up border; reply "Gave the shape on slide 4 a dashed border".

**Verified**: real browser (6 checks: rectangle Dashed / Dotted / Solid drawn and pressed, triangle's whole outline dashed, dotted line, undo + reload, the PowerPoint download has dash ×2 and sysDot); SVG geometry and dash proportions (ui test); .pptx XML (prstDash, line `cy="0"` and 4 pt for 8 px, gradient outline); template import (dash / dot / dash-dot / solid); live real model W94 (dashed red border), W95 (no border → honest refusal). Unit: API 1,573, editor 715, theme 932, ui 129, lint 0 errors.

### W5 Slice 7: picture warmth and saturation — built and verified 2026-11-23
**Before**: brightness, contrast and black-and-white only; and black-and-white was drawn by CSS `grayscale()` on screen but baked with `modulate` in the .pptx (a different formula: the download's grey was not the screen's grey).
**Built** (one rule: `packages/validation/src/picture.ts` — `pictureColorMatrix`, `colorMatrixValues`)
- **Data**: `filter.saturation` (0 none … 1 as is … 2 vivid) and `filter.warmth` (-1 cool … 1 warm), optional, so every saved picture reads as before.
- **One colour matrix** (3×3, sRGB): black-and-white, then saturation (both the CSS `saturate` formula), then warmth (red and a little green up, blue down). The screen draws it with an SVG `feColorMatrix` next to the picture (after CSS brightness / contrast); the .pptx bakes the very same matrix (`sharp.recomb`) after the same brightness / contrast; the browser exports (PNG / JPG / PDF / HTML) render the screen's drawing.
- **Editor**: Picture panel → Colour (shows "normal", "none", "130%") and Cool / warm ("neutral", "warm 0.6"); the panel is two columns so it is half as tall and the toolbar stays clear of the picture being tuned.
- **Assistant**: `picture_style` `saturation` (more / less / normal) and `warmth` (warmer / cooler / normal) in steps of 0.3 / 0.35; the "already" check knows both; replies read as a list ("more muted and cooler"; parts no longer run together: also "zoomed in 2x and showing the left part").

**Verified**: real browser (6 checks: no filter on a plain picture, the warm end drawn through the shared matrix `1.14 … 0.86`, the exported PNG warmer than before (red / blue ratio), Colour 0 = grey in the export, the .pptx holds a baked grey picture, no errors; screenshot: the panel no longer covers the picture); bake test (grey = 0.213 of red as on screen, warmer / cooler, normal values change nothing); live real model W96 (warmer), W97 (muted and cooler). Unit: API 1,576, editor 716, theme 933, ui 129, lint 0 errors.

### Open points closed — 2026-11-23
- **PowerPoint line spacing, measured in real PowerPoint**: a test deck (Arial, line heights 1.0 / unset / 1.3 / 1.5 / 2.0) opened in Microsoft PowerPoint and saved as PDF; the line pitch read from the PDF was exactly 1.2 × the multiple (PowerPoint's "single" = 1.2 × the size), so downloads were 20% looser than the screen, and a box with no spacing set came out unlike one set to the same 1.3. Now one factor (`PPT_SINGLE_LINE` in text-style.ts) both ways: the export writes lineHeight ÷ 1.2 (`pptLineMultiple`, the deck's normal 1.3 when unset), the template importer already multiplied by 1.2. Re-measured in PowerPoint after the fix: 1.000 / 1.300 / 1.300 / 1.500 / 2.000 × size, the same as the screen. Test: `pptx-word-format.test.ts`.
- **Sign-up suites brought up to date** (sign-up now asks to confirm the email): suite 02 checks the real journey (the "Check your email" screen names the address, no session before confirming, logging in first is refused with "Email not verified", then the confirmed account logs in to the editor); a shared `signUpAndEnter` (e2e/lib.mjs) for suites that only need a new account (06, 07); the two-tabs check confirms its API-made accounts. Found: every "shows an error" check matched Next.js's empty `role=alert` route announcer, so it proved nothing; they now read the form's own message.
- **Found by the now-running Starter checks**: the template window promised "a ready-made 11-slide story" while the Starter plan (10 slides) silently got the first 10. The window now says it before the deck is made ("This story has 11 slides. Your Starter plan holds 10 … starts with the first 10", with plans to compare) and marks the slide left out. Suite 06 sets its own plan (Gold) instead of depending on the suite run before it.

### Later W5, slice 1: text shadow, outline and highlight — built and verified 2026-11-23
**Built** (one rule: `packages/validation/src/text-effects.ts` — `TEXT_SHADOWS`, `textShadowCss`, `HIGHLIGHTS`, `TEXT_OUTLINE_MAX`)
- **Data**: a text box's `textShadow` (soft / strong) and `textOutline` ({ colour, width px }); a run's `highlight` (hex).
- **Drawn the same everywhere**: CSS text-shadow and -webkit-text-stroke on the box, a background behind highlighted words (also while typing); the .pptx gets an outer shadow (90°, same offset / blur / alpha in points), the letters' `a:ln` outline and `a:highlight` on the runs.
- **Readable highlights**: a highlighted word with no colour of its own is drawn in the readable text colour for its marker (`highlightText`, the tables' rule) on the slide, while typing and in the .pptx. Found on screen: white text on a yellow marker on a dark slide.
- **Editor**: the typing bar's five markers (yellow, green, pink, blue, orange) and "No highlight" for the selected words (a see-through span inside a highlighted phrase ends the highlight; it is never read as black); the Effects panel (shadow None / Soft / Strong, outline None + six colours + width; every selected text box; a width drag is one undo step).
- **Assistant**: `text_style` `highlight` (the same five names or none; with `words` only those words, else all the text), `shadow`, `outline` + `outlineWidth`; the "already" check knows them; `styleWords` keeps highlights apart (its run key now includes the highlight).

**Verified**: real browser (5 checks: one word highlighted and readable with the box staying open, No highlight inside it, soft shadow + accent outline drawn, kept after reload, the PowerPoint download has a:highlight + a:outerShdw + the outline); .pptx XML test; SlideCanvas test; live real model W98 (title highlighted yellow), W99 (soft shadow + thin white outline). Unit: API 1,578, editor 720, theme 934, ui 130, lint 0 errors.

### Later W5, slice 2: justified text and shape shadow — built and verified 2026-11-23
- **Justify**: a fourth text alignment (`align: 'justify'`), both edges straight and the last line of each paragraph at its start, as PowerPoint. One CSS mapping for the slide, the typing editor and the empty-box hint (`TEXT_ALIGN_CSS`, text-style.ts); the .pptx writes `algn="just"`; a justified PowerPoint template stays justified on import; the toolbar has a fourth alignment button; the assistant's `text_style.align` takes `justify` ("Justified the body text on slide 3"; other alignments now say "Centred …" / "Aligned … right" instead of "Changed the text style").
- **Shape shadow**: `shadow` (soft / strong, the pictures' presets) on shapes. On screen it is on an OUTER frame with the shape at 0,0 inside it, so a clipped shape (triangle, chevron, polygon) keeps its shadow; the .pptx gets an outer shadow straight down (the outline drawn over a gradient shape does not get a second one). Toolbar: No shadow / Soft / Strong for a shape. Assistant: `shape_style.shadow`. Found: the "already" check treated a shadow as picture-only and always said a shape's shadow was not done; it knows shapes now.

**Verified**: real browser (justify drawn on the slide and while typing, a triangle's shadow on the outer frame, kept after reload, the PowerPoint download has algn="just" and the outer shadow); .pptx XML; SlideCanvas frame test; live real model W100 (justify), W101 (soft shadow).

### Later W5, slice 3: radial gradients — built and verified 2026-11-23
**Before**: gradients were linear only, and the editor had none for shapes (only the assistant could give a shape a gradient; slide backgrounds had linear presets).
**Built** (one rule: `gradientCss` in validation stroke.ts; `gradient.kind: 'linear' | 'radial'` on shapes and slide backgrounds, absent = linear)
- **Radial** = from the middle out to the corners (CSS's default ellipse, the box's shape). Shapes drawn as SVG get a `radialGradient` of r = √½ (the same ellipse); the .pptx gradient picture (png.ts `gradientPng`) draws the same radial ramp.
- **Editor**: the Background menu's gradients have a Linear / Radial switch (the swatches show it; on a slide that already has a gradient the switch restyles it at once); shapes get a **Gradient** panel for the first time: Start and End colours (it starts from the shape's own colour, so nothing jumps), Linear / Radial, an angle for linear, Remove gradient.
- **Assistant**: `shape_style.gradient.radial` and the background's `radial`; the verified-claims layer carries it (the reply says "a radial gradient background" only when the slide really has one); a gradient-only shape change says "Filled the shape … with a radial gradient" (was "Restyled").

**Verified**: real browser (background Radial ↔ Linear restyles at once, a shape's radial gradient drawn, kept after reload, the PowerPoint download holds the gradient pictures); radial ramp test (centre = start colour, corners = end); SlideCanvas tests; live real model W102 (shape), W103 (slide background). Unit: API 1,581, editor 722, theme 937, ui 132, lint 0 errors.

### Later W5, slice 4: picture blur and border — built and verified 2026-11-24
**Built** (validation picture.ts: `filter.blur`, `border { colour, width }`, `pictureOutline` / `pictureOutlineSvg`, `PICTURE_BLUR_MAX`)
- **Blur**: a soft-focus Gaussian blur in the picture's SVG filter with `edgeMode="duplicate"` (the frame's edges stay solid, never fade). The exporter bakes the same standard deviation: edges copied outwards first, colour and see-through blurred apart, in FLOAT precision. Found: sharp's default integer blur kernel sums a little under 1, so a solid picture's edges came out at alpha 253 of 255.
- **Border**: a line round the inside of the frame that follows its cut shape (rectangle with its corners, circle, arch, diagonal, hexagon): one outline geometry for the exporter's mask, the screen's border and the exported picture's border; drawn as a stroke twice the width along the outline, the frame's clip cuts the outer half. A theme-colour border is baked in the deck's real colour.
- **Editor**: Picture panel → Blur (sharp … 20) and Border (colour, width 1-40, none).
- **Assistant**: `picture_style.blur` (soft = 3, strong = 8, none) and `border` (colour or none) + `borderWidth` (6 by default); the "already" check knows both.
- **Found and fixed on the way**: (1) the colour/blur SVG filter had the same id in every copy of a slide (stage, slide rail, Morph), and the page uses the FIRST one, so a copy a moment behind could lend its old filter to another; the id now carries a fingerprint of the filter's numbers. (2) A tall panel over a tall picture had no clear place and covered the picture being tuned; the toolbar now goes below the object anyway, squeezed to the room there with its panel scrolling (measured by its natural `scrollHeight`, re-measured when its content changes, so it never flips between squeezed and not).

**Rounded corners**: see the next section (decided and built 2026-11-24).
**Verified**: real browser (Blur drawn through feGaussianBlur with duplicate edges, a 16 px white border drawn inside the frame, the PNG export shows the white edge, the PowerPoint download holds the baked picture with it; screenshot: the picture fully visible while its panel scrolls below); bake tests (blur softens the red/blue edge and keeps the corners solid; border inside, its colour and width; a circle's border follows the circle); live real model W104 (soft blur + white border). Unit: API 1,584, editor 724, theme 938, ui 133, lint 0 errors.

### Rounded picture corners in the download — decided and built 2026-11-24
**Decision**: PowerPoint rounds the picture itself. A plain photo's geometry becomes PowerPoint's own rounded rectangle (`roundRect`, `adj` = radius ÷ shorter side × 100000), so the photo stays the JPEG it was (no baking to PNG: small files) and the corners are exactly the screen's. ONE radius rule for the screen, the exporter and the bake (`pictureRadius`: the picture's own radius, else the deck's theme radius; cut shapes have their own outline). Pictures baked for other reasons (crop, zoom, light, blur, shadow, border, cut shapes) get the same radius in their mask; rounded corners alone no longer bake a picture.
- **How**: a small post-processing step (`export/picture-geometry.ts` `roundPictures` / `roundInSlide`) changes the named pictures' geometry in the slide XML. A colour wash over a picture keeps the picture's name (animations and Morph rely on it; the motion step may add "#2"), so a rounding says from which of the name's shapes on: all of them for a plain photo, only the wash after a baked picture (a baked picture's frame may be larger, with room for its shadow, and has its corners already).
- **Verified in real PowerPoint**: a test deck (theme radius 80 px) saved to PDF by PowerPoint draws the photo inside a rounded rectangle whose corners curve over exactly 40 pt (80 px = 40 pt), and the photo is still a JPEG in the file. Tests: `picture-geometry.test.ts`, `pptx-word-format.test.ts`.

### Later W5, slice 5a: background picture blur — built and verified 2026-11-24
- **Data**: `background.blur` (canvas units) on a picture background.
- **One background layer** (`SlideBackground`, packages/ui): a slide's background picture is its own layer (cover-fitted, optionally blurred through `feGaussianBlur` with solid edges, scaled to the screen); the slide's colour / gradient stays the parent's CSS. The slide, the editor's stage and Morph all use it.
- **Found and fixed**: (1) the .pptx handed PowerPoint the background picture as it was, and PowerPoint STRETCHES a background to the slide, so any photo of another shape was distorted in the download; now `backgroundPicture` cover-fits it to the slide exactly as the screen does (a JPEG at the slide's size), with the same blur baked. (2) The library named every background picture `.png` even when it was a JPEG (the file's media kind did not match its name, which PowerPoint may report as damaged); the real kind is passed now. Real PowerPoint opened the exported deck and saved it as PDF without a repair prompt.
- **Editor**: Background menu → "Blur picture" slider (shown when the slide has a background picture). **Assistant**: the background's `blur` (soft 4 / strong 10 / none) through the verified-claims path (slide ops `blurs` → editor → `background_blur` expectation → check → "Softened the background picture of slide 2"); a slide without a background picture is refused with the reason.
- **Verified**: real browser (upload a background picture, the Blur slider softens its layer, kept after reload, the PowerPoint download holds a 1920×1080 background JPEG); unit tests for the layer, the cover-fit + blur, the scenarios. Unit: API 1,589, editor 726, theme 938, ui 134, lint 0 errors.

### Later W5, slice 5b: background patterns — built and verified 2026-11-24
- **Data**: `background.pattern` { dots | grid | lines | diagonal, colour, opacity, size } over a COLOUR background (so the readability rules, which read the colour, keep working).
- **One drawing** (`validation/background-pattern.ts` `patternSvg`, `defaultPattern`): the slide shows the SVG in its background layer (`SlideBackground`), the .pptx renders that very SVG to a slide-sized PNG (flat colours: small). The default is quiet: the colour that reads on the background (white on dark, black on light), faint.
- **Editor**: Background menu → Pattern (each button shows its own pattern on the slide's colour; on a gradient or picture slide the pattern goes over the deck's background colour) and Spacing; the menu stays open so Spacing is at hand. Changing the background colour keeps the pattern, re-tinted for the new colour.
- **Assistant**: the background's `pattern` through the verified-claims path ("Gave slide 5 a dotted background pattern"); catalogue phrasings for pattern, pattern off and background-picture blur.
- **Found and fixed while testing live**: (1) slide-ops changes (pattern, background blur) came back with no "applied" line, and the route answers an empty applied list with the help text ("Hey! Tell me what to update") — the unit scenarios word answers from the checked claims and could not see it; the capability now says what it did, and a pipeline test guards it. (2) Changing a slide's background left WORDS with a colour of their own unreadable (a dark-blue "Classical Physics" on black): `makeSlideReadable` now moves such words toward white / black only as far as needed (they keep their colour and emphasis; highlighted words stay on their marker). (3) The QA script read theme colours without the slide's own overrides (false "text not readable" alarms); it resolves through the slide now.
- **Verified**: real browser (Dots drawn, buttons pressed, Spacing changes it, kept after reload, the PowerPoint download has a pattern PNG background, No pattern takes it off); unit tests (the shared SVG rendered: dot centre lighter, base between dots; editor commands; layer; scenarios; pipeline guard); live real model W105 (dotted pattern), W106 (background picture blur), C11, C28, R09, W103, W104 again.

### Later W5, slice 6: grid and snap — built and verified 2026-11-24
- **A placing aid, never part of the deck** (`editor/grid.ts`): Show grid / Snap to grid / size (Small 20, Medium 40, Large 80 canvas units) in a Grid menu of the top toolbar, Shift+F9 toggles the grid (PowerPoint's key). Remembered per person in this browser (if the browser forgets, the grid is simply off). Drawn only in the editor's interaction layer: thumbnails, Present, the shared view and every download never show it.
- **Snapping**: a move lands the object's left / top edges on grid lines; a resize lands the dragged edges (never below one step; turned objects resize freely); Alt places freely, as for the guides. Decided: when "Snap to grid" is on, the GRID wins over the alignment guides — on a busy slide the guides fired on both axes almost everywhere and kept objects off the grid (found in the browser check); a guide is still shown where the object, on the grid, really is aligned.
- **No assistant op**: the grid is a view setting of the person, not a change to the deck.
- **Verified**: real browser (grid drawn on the canvas only, a drag lands on multiples of 40, Alt places freely, a resized corner lands on the grid, Shift+F9 hides it and the choice is remembered after a reload, Present never shows it); unit tests for the move and resize rules.

### Later W5, slice 7: stacked bar charts — built and verified 2026-11-24
- **One rule** (`chart-style.ts`): `stack` = unset (side by side), `stacked` or `percent` (100% stacked). Only a bar chart with two series or more stacks (`canStack`); `stackLayout` gives each segment and the axis (biggest total ×1.1, or 0–100%). Negative figures are drawn from zero, as the other bar charts are.
- **No trend line on stacked bars**: a series' own line over bars stacked on others would show figures the bars do not. Stacking takes a trend line off (the editor hides its control, the assistant says so), and a trend line is refused on stacked bars.
- **Screen = file**: the download uses PowerPoint's own `stacked` / `percentStacked` grouping (100% overlap, figures centred, a `0%` axis). The figures inside each segment take the colour that reads on THAT series (white on dark, near-black on light: `highlightText`, the table rule). The chart library has one label colour per chart, so `export/chart-labels.ts` sets each series' label colour in the file from the series' own fill (stacked bar charts only). In a 100% chart the figures are the real values, as PowerPoint shows them.
- **Figures on by default, one rule** (`chartShowsFigures`): found while building this — the file and the dialog showed figures on pies and on charts of 8 items or fewer when nothing was chosen, but the screen showed none. The screen, the file, the dialog and the assistant's "already" check now use the one rule.
- **Editor**: a "Bars" choice in the chart dialog (Side by side / Stacked / 100% stacked; greyed with a hint for one series), `setChartStack`.
- **Assistant**: `chart_style.stack` (stacked | percent | none). Found in the live check: when one message asks several things of one object and one of them already holds ("make it a stacked bar chart" on a bar chart), that part was claimed as done ("Changed the chart to a bar chart"). Each part is now checked against the object as it stands at that point (`capabilities/elements.ts`), and a part that already holds is left out of the change; if all of it holds, the person is told it already is like that.
- **Verified**: unit tests (rules, render, commands, export XML incl. per-series label colours), 5 scenarios through the real pipeline, suite 91 in a real browser (dialog choice saved, trend line taken off, 0–100% axis drawn), the download opened in real PowerPoint (stacked and 100% stacked drawn natively, labels readable on dark and light series), live model QA W107–W109 all PROD READY.
- **Found in the browser check, fixed next (below)**: a series in the theme's primary vanished on a slide whose background is the primary colour.

### Charts read on their slide — fixed 2026-11-24
- **The problem**: charts were drawn with the DECK's colours only. A series in the primary colour vanished on a primary-coloured slide, and the axis, legend and figures stayed the deck's grey text colour on a dark slide (screen and file alike); the slide's own colours (`themeOverrides`) never reached a chart.
- **One rule** (`chart-style.ts`): `chartLookOn(deckColours, slide)` → the slide's colours (deck + its own), its backdrop (`slideBackdrop`: the colour, both gradient ends, or the background colour under a picture), the series palette (`chartPalette`) and the words' colour (`chartInk`). Used by the screen (SlideCanvas → Chart), the PowerPoint export (addChartEl), the chart dialog's swatches and the assistant's series-colour op. A person's own chosen colours are never changed.
- **Decided — "vanishes" is colour distance, not contrast**: measured on the themes, brightness contrast would repaint designed palettes (cobalt's yellow series on white is 1.33:1 yet plainly visible; orange beside blue can be ~1:1). A deck colour is dropped only when it is within RGB distance 60 of the backdrop (nearly the same colour); the others move up, then the slide's text colour fills in. Words must READ: secondary text colour if 4.5:1 on the backdrop, else the main text colour, else white / near-black.
- **File = screen**: the export's axis words, legend, figures and grid follow the same ink; the upright value-axis line is off and the base line is grid-coloured, as the screen draws it (PowerPoint's default gold axis line was a visible difference).
- **Verified**: rule tests, a render test on a same-colour backdrop, an export test (no series in the slide colour, white words on blue), suite 91 check in a real browser (no bar or chart word in the slide's colour; screenshot reviewed), the file opened in real PowerPoint on a primary-blue slide (orange / yellow series, white words, dark figures on yellow).

### Later W5, slice 8: merged table cells — built and verified 2026-11-24
- **One rule** (`packages/validation/src/table-merge.ts`): a table keeps `merges` = areas `{ row, column, rows, columns }` (top-left cell + size; row -1 = the header, the same numbering as `highlights` and the editor's cells). The top-left cell keeps the words and the look; the cells it covers are not drawn. `validMerges` never trusts a stored list (outside the grid, single cells, overlaps are dropped); `cellSpans` tells every renderer how to draw each cell. Screen, editor dialog, PowerPoint export, PowerPoint import and the assistant all use it.
- **Decided, as PowerPoint does**: merging keeps every cell's words in reading order in the top-left cell (repeated words once) and says so ("their words now read as one: …"); the header row merges only across, never into the body (PowerPoint's header band); a merge that would cut an existing merged area in two is refused with the area named; a bigger merge takes in the areas inside it; a highlight on a covered cell goes (it could never show). A header area across columns is centred, on screen and in the file.
- **Every grid change goes through the rule** (`insertRow`, `removeRow`, `insertColumn`, `removeColumn`, `reorderRows`): merges grow, shrink, move or drop with their cells, and the words of a removed top-left cell move to the new one. Found while building this: adding/removing rows or columns and sorting (editor and assistant) left HIGHLIGHTS on the old row/column numbers; they now follow their cells too. A sort through an area over several rows is refused ("unmerge them first").
- **Editor**: the table dialog selects a block (click, Shift+click, or Shift+Alt+arrow keys), grows the selection to whole merged areas, and has Merge cells / Unmerge (disabled with the reason in its tooltip, a polite status line after each). Merged cells show as one input in the dialog.
- **PowerPoint**: the export writes PowerPoint's own merges (gridSpan/rowSpan on the top-left cell, hMerge/vMerge on the covered ones, every grid cell present). The import reads them back (a header cell merged into the body is kept apart, with a note; an area cut by the 8-column/21-row limit keeps the part that is left).
- **Assistant**: `table_merge` { action merge|unmerge, row ("header", N below it, or the first cell's words) / toRow, column (header name or N) / toColumn }; no column = the whole row, no row = the whole column, unmerge with neither = every merge. Rows and columns are found by code from the person's words. A cell edit aimed at a covered cell goes to the merged cell the person sees. The first prompt's budget (3,500 tokens) was paid for by trimming wording, not raised.
- **Verified**: 12 rule tests, editor command tests, AI op unit tests, 11 new scenarios through the editor's real apply step (391 scenarios green), export XML test, import round trip through our own file, suite 94 in a real browser (6/6: merge header, block over rows from the keyboard, refusal with reason, row deleted through a merge, the downloaded .pptx, unmerge + undo), suite 52 (21/21, two stale checks brought up to date: Starter has the advanced editor since the plans changed; the scratch page heading is waited for), the file opened in real PowerPoint (header across two columns centred, a cell over two rows, a row merged across three columns, highlight kept), live model QA W110–W113 all PROD READY (merge header cells, merge by row names, honest refusal for header-into-body, unmerge all).

### Later W5, slice 9: a brand on some slides only — built and verified 2026-11-24
- **Structure**: a slide may carry its own brand (`slide.brand`: the brand's INPUTS — name, primary, accent, fonts, logo — never a frozen palette). ONE rule, `slideTheme(deckTheme, slide)` in packages/theme/src/slide-theme.ts: the deck theme with the slide's brand applied (`applyBrandToTheme`, colours worked out against the deck's design in force, so a later design change still gives readable brand colours), then the slide's own look (`themeOverrides`) on top. `slideBase` = before the own look (what an own look is worked out against and what a slide is composed with). Settled (frozen) themes are memoised.
- **Every consumer goes through it**: colour resolving (`resolveColor`, `effectiveBackground`), the checks (fonts measured in the slide's own fonts), the screen (SlideCanvas, charts, footer, writing placeholder), the PowerPoint file (fonts, shape and line colours, charts, tables, footer, backgrounds), the editor (every re-compose site, own-look maths, typing box, format bar, colour panels, chart dialog, background reset). Found while doing it: tables in the file ignored a slide's own colours (they now read them).
- **Decided**: applying a brand to the WHOLE deck afterwards clears per-slide brands (the whole deck is then in that brand); locked slides are left alone and said; a hand-edited slide gets its logo without being redrawn.
- **Editor**: Brand tab → "Apply to: Every slide / This slide / Slides [1-5]" (the shared slide-range reader, checked while typed) for a saved kit and for a brand read from a website/file; a line lists slides with their own brand + "Back to the presentation's look".
- **Assistant**: `brand` takes `slides` (as said) or the task's slide targets (scope `none`: no slides = the whole deck), `remove: true` takes it off; website and uploaded-logo brands share the one ending (`brandStep`). New expectation `slide_brand` (checked on the slide, claimed "Applied the Acme brand to slides 2, 3 and 4").
- **Verified**: unit tests (commands, render, export XML), 7 scenarios, suite 95 (4/4: refused range, slides 2-3 only, the .pptx, back + undo), live W114 (found: the model put the slides in targets, not values — fixed structurally by reading both) and W115 PROD READY; W116 (no slide 99) proven by its scenario, live run waiting for the free tier.

### Later W5, slice 10: comments on an object — built and verified 2026-11-24
- **Structure**: `comment_thread.element_id` (migration 0050) names the object; x/y keep where it was. ONE rule `commentPinOf(el, aspect)` (packages/validation comment-pin.ts): the pin sits at the object's top-right corner and FOLLOWS it (drawn live from the object); a removed object leaves the pin where it was and the thread says "On an object that was removed". The server checks the object is on the saved slide.
- **Editor**: right-click an object → "Comment…" (one object); the panel says "On the picture on slide 1"; a thread's "On the picture" selects the object.
- **Assistant**: `comment.add` takes `on` (an object ref, found by the same resolver as every object request) or the selected object; the reply names it.
- **Verified**: route tests (stored, wrong slide/unknown object refused), 3 scenarios, suite 96 (4/4: comment via menu, pin follows a move, select from the panel, delete keeps the comment).

### Later W5, slice 11: a collaborator who can view and comment only — built and verified 2026-11-24
- **Structure**: `presentation_member.role` editor | viewer. `resolveAccess(deck, actor, need = 'edit')`: a viewer gets in only where a route asks for `view` (open the deck, build status, versions, picture usage, live updates/presence, comments); everything else — saving, AI edit and Ask (owner's credits), pictures, media, restore, chat — answers 403 `VIEW_ONLY` (its own error, not an upgrade). Edit is the DEFAULT, so a route added later is closed to viewers.
- **Editor**: the document store is read-only for a viewer (`readOnly`: apply/undo/redo refuse; remote changes still arrive), the canvas treats it like a locked slide, toolbars/AI/Style are hidden, a "View only" badge; menus offer Copy and Comment. The owner changes the role in Share (per person) and the viewer's open editor switches at once (live `access` event, only to that person; becoming a viewer drops unsaved changes and says so).
- **Assistant**: "invite anna@… to view and comment only" prepares Share with the view-only choice (`viewOnly`).
- **Verified**: collab tests (viewer opens/comments; save, AI, Ask, pictures, restore refused with VIEW_ONLY; owner switches roles; a collaborator cannot), scenario, suite 97 with two real accounts (4/4).

### Later W5, slice 12: controls for the settings that had none — built and verified 2026-11-24
- Found by scanning every schema field against the editor: the deck's DESIGN settings (`theme.style`: title style and background, heading style/weight/letter spacing/capitals, cards, decoration, photo frames, bullets, diagrams, body background, footer + its own words) and the transitions' easing and Morph blend had no control.
- **Style → Design** tab (`setDesignStyle`: validated by the schema, redraws the designed slides like a design swap, one undo step). Transitions ribbon: Easing (all transitions) and Blend (Morph).
- **Found and fixed**: the footer was drawn only in the PowerPoint file (the editor, Present, the share page and the rail never showed it) — `Footer` is now drawn by every deck view; non-Morph transitions ignored the stored easing (one fixed curve) — `transitionStyle` now plays it (PowerPoint has no easing for its transitions: the control says it is the slideshow's).
- **Verified**: command + transition-curve unit tests, suite 98 (3/3: capitals and weight saved and drawn + undo, footer in the editor canvas and Present, easing and Morph blend saved).

### Later W5, slice 13: text alignment inside table cells — built and verified 2026-11-24
- **Structure**: `table.aligns` ({row, column, h, v}; row -1 = header) in the same rule module as merges (`packages/validation table-merge.ts`: `alignOf`, `alignCells`; every grid change carries the aligns along). Screen (td/th text-align + vertical-align), PowerPoint (`algn` on the paragraph, `anchor` on the cell) and the importer read the one rule. Defaults stay left/middle; a merged header is centred.
- Editor: Table dialog alignment buttons. AI: `table_align` (named like `table_merge`; a whole column includes its header).
- **Verified**: rule + export tests, suite 94 (7/7), real PowerPoint.

### Later W5, slice 14: area and scatter charts — built and verified 2026-11-24
- **Structure** (`packages/validation chart-style.ts`): `CHART_TYPES` adds area and scatter; `scatterXs` (a scatter needs numbers as its labels: they are its x values), `chartTypeProblem` (the one "can this chart be that type" rule for the editor and the AI), `linearFitXY` (the trend line), `chartShowsFigures` (area: figures off by default).
- Screen: filled area polygon; scatter points on a numeric x axis with a fitted trend line. PowerPoint: native area (55 % see-through) and XY scatter, with a native trendline added after pptxgenjs (`export/scatter-trend.ts`; pptxgenjs numbers chart files across the whole process, so a deck's charts are matched by position). Import reads both back.
- Editor: Chart → Area / Scatter, the chart dialog's Type (Scatter refused for words as labels). AI: chart_type / add_chart / chart_from_table use `chartTypeProblem`.
- **Verified**: export + render + command tests, scenarios, import round trip, suite 99 (3/3), real PowerPoint.

### Later W5, slice 15: a different background per section — built and verified 2026-11-24
- **Structure**: ONE section rule, `packages/validation sections.ts` (a section runs from a section-divider slide to the next; the slides before the first divider are the opening run). One copy command, `copyBackground` (editor commands: the slide's background exactly as it is: colour + pattern, gradient with its angle and kind, picture with its blur, or the deck's own).
- Editor: Background menu → "Use on this section (slides X–Y)" (only when the deck has dividers and the section has other slides) and "Use on all slides"; one undo step.
- AI: slide reference `{"by":"section","n"?}` (resolve.ts; n counts the DIVIDERS as a person does; no n = the section of the slide on screen; a deck without dividers is refused plainly) and background `"from":N` (slide N's background as it is) → a new answer part `backgroundCopies`, applied by the editor's own `copyBackground`, checked as `background_copy` (target = source by value) and worded "Gave slides 5 and 6 the background of slide 4".
- **Found and fixed on the way**: the AI panel built its undo list of "slides whose look changed" by hand in two places and left out patterns, blurs and per-slide brands (their "undo that" could not put them back): now one function, `lookSlideIds`, lists every kind.
- **Verified**: rule + command + undo tests, 5 scenarios (copy, numbered section, no sections, out of range, locked slide asks first), suite 100 (5/5). Live: W119, W120.

### Later W5, slice 16: a theme made from a brand kit — built and verified 2026-11-24
- **Structure**: a brand theme keeps only its INPUTS (`brand_theme`, migration 0051: kit, design, light/dark, name; deleted with its kit), like a per-slide brand. ONE rule, `brandTheme(design, mode, kit)` in `packages/theme brand-theme.ts`: the design in its own mode keeps its exact ground, the other mode is built from the same seeds, then the kit's colours, fonts and logo (`applyBrandToTheme`). Editing a kit changes its themes. Gate = brand kits (Gold, Premium); a Pro design needs `premiumTemplates`; at most 20.
- API `GET/POST/DELETE /brand/themes`. A NEW deck can be started in one (`brandThemeId`: that design, mode and kit exactly instead of the topic's colours; not with a template, kit, rewrite or remix).
- Editor: Style → Brand → "Themes from your brand": make one (template, Light/Dark, name, live preview from the same rule), Apply (one undo step), Delete. Create page: with themes saved, a "Look" choice (a design for the topic, the brand kit, or a theme).
- AI: brand_kit `"action":"theme"` (kit by name or the default, the template named or this deck's, light/dark as said; ALWAYS asked first, saved by the Brand tab's code) and a theme picked by its name like a template ("use my Acme night theme").
- **Verified**: 6 API tests (incl. a mock-model deck built in a theme), 4 scenarios, suite 101 (3/3: make, apply + undo, kit edit flows through, delete). Live: W121, W122.

### AI provider: Gemini direct, OpenRouter as the backup — decided and built 2026-11-24
- **Owner decision**: customers get **Gemini models only** (no Claude, GPT or GLM). Google AI Studio direct is the main route (no middleman fee); OpenRouter is kept only as the BACKUP for when Gemini's Tier 1 limits are reached, the prepay credit runs out, or Google is down. The pricing page says "Pro AI models" (Premium card and its feature line), the privacy page names Google as the AI provider and OpenRouter as a backup route to the same Gemini models.
- **The backup serves the SAME model** (`registry-db.ts buildRegistry`): rows on the backup provider become twins of the main rows with the same model name and kind; they are never listed, picked or charged differently (a twin bills in the main model's credit class). Every chain = the main models, then their twins in the same order (`ModelRegistry` backups). Not Claude/GLM as backup: our prompts are tuned for Gemini, and they behave and cost differently.
- **Circuit breaker** (`packages/ai` gateway, per provider): 401/402 (key refused, credit used up) pass the provider over for 2 minutes at once; three 5xx / 403 / network failures in a row for 1 minute; any good answer closes it. Passed-over models go to the back of every chain (still the last resort, which is how the provider is tried again), and inside one request its remaining models are skipped while another provider is still to come. A 402 says RESOURCE_EXHAUSTED on Gemini: it is billing, never waited out as a rate limit (was: the limiter counted it as one).
- **Overflow before refusal**: the limiter says how long a new call would wait (`waitFor`: pause, queue, rpm/tpm buckets); a model over 5 s goes behind the ready ones, so with `AI_LIMITS` set to the tier's limits the backup answers before Google refuses.
- **Owner alert**: `[ai] ALERT: the BACKUP (OpenRouter) answered N call(s) … Why Gemini did not: …` at most every 10 minutes (same pattern as the spend alert); every backup call is in the usage ledger under provider `openrouter`.
- **Catalogue (migration 0048)**: direct Gemini rows (AI Studio; filed under "vertex", same ids) serve production; their OpenRouter twins are listed everywhere (used only where the backup is configured); Claude, GLM and Gemini 2.5 Flash rows kept but switched off. Prices re-checked on the AI Studio page. **Gemini 3.1 Pro** = Premium's "Pro" model: credit class premium, **5 credits a slide** (2.5x Flash; it costs about 3x Flash per token: worst-case margin about 75 % on Premium); Premium writes with 3.6 Flash unless the person picks Pro. The picker groups read "Standard" and "Pro".
- **Found and fixed on the way**: Gemini 3.1 Pro refuses thinking 0 ("only works in thinking mode": every Premium deck on Pro would have failed): new column `min_thinking_budget` (128 for Pro, probed), honoured by the gateway and passed to OpenRouter as `reasoning.max_tokens`. The backup twins were listed for staging/production only, so development could never switch (found by the browser check).
- **Settings**: `AI_BACKUP_PROVIDER=none|openrouter` (needs `OPENROUTER_API_KEY`); the server scripts turn it on when the key is stored. Test-only (refused in production): `OPENROUTER_BASE_URL` (a local stand-in), `AI_TEST_MAIN_REFUSAL=402|429|503`.
- **Verified**: 10 gateway tests (`packages/ai/src/backup.test.ts`: order, 402 switch without waiting, breaker open/close, outages, Pro → same Pro twin with its thinking minimum, blocked prompts don't trip it, overflow, 402 not waited out), 3 catalogue tests; `e2e/ai-backup-switch.mjs` 4/4 in a real browser with Gemini forced to refuse (402) and a local OpenRouter stand-in answering with real Gemini: Premium picker shows Gemini only as Standard/Pro, a deck on Gemini 3.1 Pro built entirely through the backup on the same model, ONE Gemini refusal then the breaker kept Gemini out, 15 credits for 3 slides, the ALERT in the log. Normal path: a real Premium deck on Gemini 3.1 Pro direct (all calls succeeded, 15 credits).
- **Open**: OpenRouter itself not yet called (no key on this machine): store the key, set a credit limit and training OFF at openrouter.ai, then run `e2e/ai-backup-switch.mjs` without `OPENROUTER_BASE_URL`. `AI_LIMITS` for the real tier. The privacy page's hosting row says "AWS Mumbai" while the recorded decision is Sydney (owner to confirm; not changed).
