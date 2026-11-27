# Edit with AI: big requests (proposal, 2026-11-26)

Status: **built 2026-11-26 (slices 1 to 4; see the build record at the end). Not committed.** The owner approved on 2026-11-26 by re-sending the request after the pricing was settled.

The goal: Edit with AI must handle three kinds of message well.
- **Medium messages** ask for 3 or 4 changes in one go.
- **Long messages** ask for many changes.
- **Whole-deck requests** ask to make the deck more professional, turn it into a pitch deck, tell a better story, fit 15 minutes, and so on.

Small edits must stay exactly as fast and as good as they are today.

---

## 1. What happens today with these messages (read in the code)

| Message | What the code does now | Problem |
|---|---|---|
| 3-4 changes ("make slide 2 shorter, dark theme, add a thank-you slide") | `understand` splits it into tasks. With 3 or more, the person is shown a plan and confirms it. Tasks then run **one after another** (`pipeline.ts`). | Works. It is slower than it could be, because tasks that touch different slides wait for each other. |
| 5+ changes | Only the first **4** run (`MAX_STEP = 4`). The rest are listed as "still to do", for the next message. | The person has to send a second message. Also, `understand` may answer only 900 tokens, so a very long message can be cut off and parts can go missing. |
| "Make the whole deck more professional / simpler / for executives" | This becomes one `text` task on every slide. Writing runs in batches of up to 8 slides, 3 batches at a time, and each batch is written **on its own**. | No batch sees the deck as a whole. Transitions between slides, repeated points and one consistent story are left to luck. Every slide is rewritten, even the good ones. |
| "Turn this into an investor pitch deck" / "storytelling" | This becomes either `rewrite_deck` (the whole deck rebuilt from a brief, with new words and new pictures) or the bulk `text` task above. | `rewrite_deck` can lose the person's own facts and figures. Bulk `text` cannot add, merge or reorder slides to fit a pitch structure. |
| "Add 5 slides that fit" / "strong conclusion with 3-5 recommendations" | `add_slide` with `where: spread` or `end`. | It does not first read the deck to find what is missing, or where each new slide belongs. |
| "Optimise for 15 minutes" | Nothing maps to it. The parts it needs exist separately: cut slides (`restructure reduce`), shorten text, timed speaker notes. | It is understood as a vague rewrite. |
| "Improve the visual design, turn bullets into diagrams" | `layout` on some slides, or `repair`. | There is no deck-wide view of which slides look crowded or repetitive, or which ones would make a good timeline or comparison. |

**Summary:** the tools to do the work already exist (text, layout, add, merge or split, reduce or reorder, notes, repair). What is missing is a step that **looks at the whole deck and plans the work before writing**, and a runner that does a long plan **quickly and safely**.

---

## 2. Rules (from the owner's list, made checkable)

1. **One slide or the whole deck.** This is decided from the message, the selection, and the "This slide / Whole deck" switch. When it is unclear and the change is large, ask once, for free.
2. **Keep facts.** Every number, name, date and quote in the deck is written into a *facts ledger* before any writing. After writing, code checks the ledger. A fact may disappear only when its slide was deleted *by the plan the person confirmed*, and the reply says so.
3. **Invent nothing.** No new figures, statistics, research, traction or financials unless they come from an attached source. A pitch deck with no figures gets an empty placeholder such as `[your monthly revenue]`, never a made-up number. The content sanitiser already strips unsourced figures. The facts check is added on top.
4. **Keep the look.** Theme, fonts, colours and brand stay unless the message asks for a design change.
5. **Leave good slides alone.** The plan says *keep* for slides that already do their job. Only changed slides are written, and only changed slides are charged.
6. **Same voice and structure.** One brief (audience, tone, length) is used for every slide, and each slide is written knowing its neighbours.
7. **New slides go where they belong.** The plan chooses the position (after slide N), not "at the end".
8. **Never break a layout.** Today's checks stay: layout fit, point limits, locks, hand-edited slides, animated-template slides.
9. **Apply the changes, not advice.** The result is on the deck. Advice is given only when the message asks for advice.
10. **The person can review and undo.** It is one undo step. A version is saved before the change, and a "What changed" list lets the person put back any single slide.

---

## 3. The design: three lanes, chosen by code

```
message ─► READ (fast model; exists) ─► UNDERSTAND (fast model; exists)
                                              │
                    code looks at the answer and picks a lane (no extra model call)
          ┌───────────────────────────────────┼──────────────────────────────────┐
     QUICK lane                          STEPS lane                         DECK lane
  1-2 tasks (today)                3-10 separate tasks             one goal for the whole deck
  unchanged, same speed       plan ► confirm ► run in waves     brief ► map ► plan ► confirm ►
                                                                  run in waves ► check ► apply
```

- **Quick lane:** today's path with no change. Most messages are small, and they keep today's speed and behaviour.
- **Steps lane:** many separate changes ("dark theme, shorter slide 3, add a timeline, fade transitions").
- **Deck lane:** one goal applied with judgement across the whole deck ("make it professional", "pitch deck", "15 minutes", "for a business audience").

A long message can be both: "make the deck more professional, use navy and gold, and add slide numbers" becomes one *deck* task plus two quick tasks, all in one steps plan.

### 3.1 Reading long messages without losing parts

- The reading step (`reading.ts`, built, not yet committed) gains `parts: string[]`. That is the message cut into separate requests, in the person's own words, with typos fixed.
- `understand` must account for every part: each part becomes a task, an *unsupported* note, or a question. **Code checks the count.** A part with no task gets one targeted re-ask. If it is still missing, the reply says "I didn't do: …". A part is never dropped silently.
- `understand` output tokens grow with the number of parts (900 + 250 per part, up to 3,000). A long message is no longer cut off.

---

## 4. The steps lane (3-10 changes)

1. **Plan preview** (exists from 3 tasks). It is raised from 4 to **10** tasks in one plan. Above 10, the first 10 run and the rest are offered as the next step, like today.
2. **Order by dependency, not just by sentence order.** Code sorts tasks into phases. Inside a phase, the person's order is kept.
   - **Structure:** add, delete, move, merge or split, reorder.
   - **Words:** text, notes, enrich.
   - **Layout and objects.**
   - **Look:** theme, palette, fonts, background, brand.
   - **Motion:** animations, transitions.

   "Add a slide about pricing and make it a table" therefore always adds first. The existing `added_by_task` links keep working.
3. **Run in waves, in parallel where it is safe.** Tasks in the same phase that touch **different slides** run at the same time. Tasks on the same slide run one after another. Deck-wide look tasks (palette, fonts, theme) are pure code and take milliseconds. This uses the same `inParallel` helper as bulk writing, with a cap of 4 model calls at once per request.
4. **One failure does not sink the rest.** Each task is checked on its own (today's `check` and `withhold`). The reply says which parts were done and which were not, and why.
5. **One result.** Everything is applied together as one undo step with one saved version, as today.

**Expected effect:** four writing tasks on different slides take about one writing round instead of four. Phase 1 measures this before and after.

---

## 5. The deck lane (one goal across the deck)

New capability **`transform`**. It does not write slides itself. It plans, and then the existing capabilities do the work.

**values:**

```
goal:        what the deck should become ("more professional", "investor pitch", "simpler for beginners", "15-minute talk", "more engaging")
audience?:   "senior executives", "investors", "beginners", "managers"
tone?:       "confident", "simple", "persuasive"
structure?:  "pitch" | "story" | null        (a target outline to map onto)
minutes?:    15                               (a talk length: slide count and notes follow from it)
addSlides?:  5                                (exactly this many new slides)
ending?:     { recommendations: 3-5 }         (a conclusion slide with recommendations drawn from the deck)
design?:     true                             (layouts and visual variety are part of the goal)
```

### Stage A: deck map (code, about 0 s)

Code builds the map from the document, with no model call:
- the outline: each slide's number, title, layout, word count, points and lock state;
- the facts ledger: numbers, names, dates and quotes, per slide;
- what `reviewFindings` finds: too much text, repeated layouts, empty slides;
- which slides cannot be touched: locked, hand-edited, animated templates.

### Stage B: editorial plan (one quality-model call)

The model sees the brief and the map (outline and short slide texts, not the full JSON). It returns **one action per slide**:
- `keep`;
- `rewrite` with a one-line note ("lead with the 32% saving; cut the history");
- `shorten` or `expand` with a note;
- `layout` (for example a timeline, a comparison or a process);
- `merge` with slide N, or `split` into 2;
- `delete` (only with a reason);

It also returns:
- **new slides** ("after slide 4: market size; use only the deck's own figures or leave placeholders");
- the **new order** of slides;
- **section names**;
- for `structure: pitch`, which slide fills which pitch section, and which sections are missing (these become placeholder slides, never invented content).

**Code checks the plan before showing it:**
- it may not touch locked or hand-edited slides;
- it may not delete more than the goal allows;
- every ledger fact must be on a kept or rewritten slide, or on a slide deleted with a reason;
- slide count limits for the plan;
- the minute goal: about 1 to 1.5 slides per minute, with notes timed at 140 words per minute (`SPEAK_WPM` exists).

If the plan fails a check, it gets **one** re-ask that names the problems, the same pattern as `check` today.

### Stage C: preview and confirm (free)

```
I'll turn this into an investor pitch deck (16 → 14 slides):
• Keep 4 slides as they are (1, 6, 9, 12)
• Rewrite 7 slides for investors: lead with the problem and the numbers you already have
• Merge 7 and 8 (both about competitors) · Delete 13 (repeats slide 3)
• Add 2 slides: "Business model" after 5, "The ask" at the end (with blanks for figures you fill in)
• Turn slide 10 into a timeline
Nothing has changed yet. Go ahead?        [Yes, go ahead]  [Show me slide by slide]  [No]
```

The confirmed plan travels back as `confirm: { kind: 'transform', plan }`, in the same way `proceed`, `text_bulk` and `rewrite` work today. The model is not asked again. Code re-checks the plan against the deck as it is at that moment.

### Stage D: run in waves (existing capabilities, in parallel)

1. **Structure first** (code): delete, merge, split, reorder, then placeholders for new slides.
2. **Words** (quality model, in parallel):
   - each writing call gets the **brief**, its slides' plan notes, and the **titles of the slide before and after** (for flow);
   - batches of about 4 slides, up to 4 calls at once (today it is 8 slides and 3 calls; smaller batches finish sooner and fail smaller);
   - new slides are written in the same wave.
3. **Layout** (fast model or code): the layout actions from the plan, through the existing `layout` capability.
4. **Notes** (when `minutes` is given): timed speaker notes, in parallel.

### Stage E: checks (code), then apply

- **Facts ledger:** any fact that went missing from a slide is put back by one targeted retry for that slide only. If the retry fails, the old slide is kept and the reply says so.
- **No new figures:** the existing sanitiser, plus a comparison against the ledger and the sources.
- **Layout fit and point limits:** the existing checks.
- **Coverage:** every planned action either happened or is reported as not done.
- **Apply:** one version is saved first ("Before: investor pitch"), and the result is applied as one undo step. The reply lists what changed per slide. A **"What changed"** list in the panel lets the person put back any single slide; the `revert` op with `part: 'slide'` already exists.

### Long runs go through the job queue

A transform that writes more than about 8 slides runs as a **job** on the existing deck queue (Postgres, SKIP LOCKED, lanes), the way `rewrite_deck` already does. This gives three things:
- closing the tab or a dropped connection loses nothing;
- the panel follows live progress ("Rewriting slides 5-8 (2 of 4)");
- the request never hits an HTTP timeout.

Small transforms stay in the request.

---

## 6. Speed

The targets below are measured with the e2e suite on the real model before anything is switched on. They are not promises yet.

| Lane | Model calls | Target time |
|---|---|---|
| Quick | read + understand + 0-1 write | same as today (no change allowed) |
| Steps, 4 changes on different slides | read + understand + 1 parallel wave | about 1 writing round, not 4 |
| Deck, 12-15 slides | read + understand + plan + 1-2 parallel waves | plan shown in under 15 s; applied in under 45 s |
| Deck, 30+ slides | the same, as a job | progress every few seconds; about 60-90 s |

How the time is saved:
- **Planning sees the outline, not the full JSON:** smaller prompts.
- **Parallel waves.**
- **Pure-code steps** (structure, theme, checks) cost no model time.
- **Fast model** for reading, understanding and layout; **quality model** only for the plan and the writing.
- **No rewriting of `keep` slides.** That is often a third or more of a deck, and those slides cost neither time nor credits.
- **Retries are per slide, never for the whole deck.**

The person sees live progress all the time (the SSE stream exists): the plan first, then each wave.

---

## 7. Not breaking anything

- The quick lane is unchanged, and every existing test must still pass.
- The new lanes sit behind a flag, **`assistant_big_edits`** (off in production until approved), on top of `assistant_v2`.
- **Before and after:** run the full AI QA cases (`e2e/ai-full-qa.mjs`) with the flag off and then on, on the same key ring. No case that passes today may fail.
- New unit tests: lane choice, part coverage, phase ordering, parallel waves (same slide never at the same time), plan checks (locks, facts, deletions), confirm tampering, facts-ledger restore.
- New e2e cases: the prompt collection in section 9, each with code checks.

---

## 8. Credits and margins (researched 2026-11-26)

### Inputs (all verified on 2026-11-26)

**Google prices** ([aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing)), per 1M tokens:

| Model | Input | Output | From 2027-01-01 |
|---|---|---|---|
| Gemini 3.6 and 3.8 Flash | $0.75 | $3.75 | doubles to $1.50 / $7.50 |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 | no change |
| Gemini 3.1 Pro | $2 | $12 | no change |

**What one credit earns** (INR plans, which are the worst case): price ÷ 1.18 GST, then minus Razorpay's 2.36%, at ₹93.5 per $.

| Plan | Net per month | Net per credit |
|---|---|---|
| Pro (₹300, 900 credits) | $2.66 | $0.00295 |
| Gold (₹650, 2,000 credits) | $5.75 | $0.00288 |
| Premium (₹1,200, 3,700 credits) | $10.62 | $0.00287 |

USD plans earn about 3.5 times more per credit.

**Measured cost** (the `ai_usage_event` ledger, last 45 days; this cost was reconciled against Google's bill in October):

| What | Tokens (in / out) | Cost |
|---|---|---|
| One deck slide (`slide_content`, 6,591 calls) | 1,507 / 584 | $0.0033 |
| One slide rewritten by the assistant (substantial writes) | 1,269 / 663 | $0.0034 |
| Understand step on Flash-Lite | 2,842 / 100 | $0.00084 |

An assistant message costs **$0.005 on average** (median $0.0019, p90 $0.0084). That is 5 times the $0.001 in PLANS_AND_FEATURES_V5.md, because v2 and v3 added steps.

### A deck change, priced by each option

Example: a 15-slide deck where 10 slides are rewritten.

**Cost:**

| Part | Today | From 2027 |
|---|---|---|
| Read + understand | $0.0012 | $0.0012 |
| Plan call (about 6k tokens in, 1.5k out) | $0.010 | $0.020 |
| 10 slides written | $0.034 | $0.069 |
| Retries (about 10%) | $0.003 | $0.007 |
| **Total** | **≈ $0.049** | **≈ $0.097** |

**Price and margin:**

| Option | Credits | Earns | Margin today | Margin 2027 |
|---|---|---|---|---|
| (a) flat 3 edits | 6 | $0.018 | −175% | loss |
| (b) 1 edit per 5 slides | 4 | $0.012 | −315% | loss |
| (c) 2 edits, as today | 4 | $0.012 | −315% | loss |
| **(d) 2 credits per message + 3 per slide written** | 32 | $0.094 | **+48%** | −3% |
| (e) 2 credits per message + 4 per slide written | 42 | $0.124 | +60% | +22% |

**Correction:** options (a) to (c) all lose money, so my first recommendation, (b), was wrong. A slide the AI writes costs the same as a slide of a new deck, so it must be charged like one.

**Recommendation: (d) now and (e) from 2027-01-01.**
- The first written slide stays inside the base 2 credits, so a one-slide edit costs the same as today.
- Code-only changes (theme, colours, fonts, moves, deletes) add nothing.
- `keep` slides are free.
- The exact price is in the plan preview before "Go ahead", and the plan and questions stay free.
- The same rule covers the steps lane, so a 10-change message cannot write 10 slides for 4 credits.

**Heavy-user check (Pro, every credit spent on deck changes):** about 290 slides written costs about $1.2 a month against $2.66 earned, a 55% margin today. In 2027 the margin is about 10% under (d) and about 45% under (e).

### Problems the research found outside this feature (owner decisions)

1. **Deck slides at 2 credits lose money from 2027-01-01 on INR plans** when a person uses all their credits. A slide earns $0.0059 and will cost $0.0066. Today it earns a 44% margin. Before 2027 we need one of these:
   - 3-4 credits a slide;
   - fewer credits per plan;
   - writing on Flash-Lite (about $0.0011 a slide, lower quality).
2. **The AI edit itself is already thin.** The average message costs $0.005 against $0.0059 earned (2 credits), a 16% margin today, and it loses money from 2027. The median is fine (68%), but the long tail is not. The per-slide rule above fixes this.
3. **Premium with Gemini 3.1 Pro:** a slide measured $0.0198 against 5 credits ($0.0144). That is a loss today. The sample is small (27 calls) and uses `min_thinking_budget` 128, so re-measure before launch. It probably needs about 8-10 credits a slide.

---

## 9. The prompt collection (the test set)

Each prompt becomes an e2e case in `e2e/ai-full-qa-cases.mjs`, with checks done by code. These checks apply to every case:
- facts ledger kept;
- no new figures without a source;
- theme unchanged unless asked;
- locked slides untouched;
- the reply matches what changed;
- credits match the preview.

### 9.1 Whole deck (the owner's 12)

| # | Prompt (short name) | Lane / plan shape | Extra checks |
|---|---|---|---|
| D1 | Improve content, flow, one idea per slide | deck: rewrite + shorten, some keep | at least 1 slide kept unchanged on a good deck; word count does not grow |
| D2 | Professional, for senior executives; insight titles | deck: rewrite titles + body | titles are not generic ("Overview", "Introduction" are replaced) |
| D3 | Expand with details, examples, context | deck: expand | words grow; no new figures without a source |
| D4 | Investor pitch deck (problem … funding ask) | deck, structure pitch | every pitch section present or a placeholder; zero invented figures |
| D5 | Storytelling: opening, narrative, takeaway | deck, structure story | first and last slides rewritten; order may change |
| D6 | Simplify for a general audience | deck: rewrite, tone simple | reading level drops; technical terms explained, not deleted |
| D7 | Improve visual design; bullets into diagrams | deck: layout + repair, design | theme the same; at least 2 slides get a new diagram layout; no text lost |
| D8 | Add 5 relevant slides in the right places | deck, addSlides 5 | exactly +5; not all at the end unless the plan says why; no repeated topics |
| D9 | Adapt for managers and stakeholders | deck: rewrite, audience | business wording; nothing invented |
| D10 | More engaging: headlines, questions, variety | deck: rewrite + layout | at least 2 layouts change; no repeated slides |
| D11 | Strong ending + 3-5 recommendations | deck: ending | a conclusion slide with 3-5 points drawn from the deck's own content |
| D12 | Optimise for a 15-minute talk | deck, minutes 15 | 10-20 slides; notes about 140 words per minute in total; intro and conclusion present |

### 9.2 More whole-deck prompts (added)

- **D13** "Cut this deck down to 8 slides without losing any of the numbers, and merge anything that repeats."
- **D14** "Make all the slide titles consistent: short, action-style, same style everywhere. Don't touch the body text."
- **D15** "Write speaker notes for every slide for a 10-minute talk, conversational, not reading the slide."
- **D16** "Rewrite this for university students who are new to the topic, and add a short glossary slide at the end."
- **D17** "Translate the whole deck to Hindi, keep brand names and numbers in English, and keep the same layouts."
- **D18** "This deck is too text-heavy. Turn the lists into visuals wherever it makes sense and keep the rest short."
- **D19** "Make it a sales deck for a client meeting: their problem first, our solution, proof, pricing slide last. Use only what's already in the deck."
- **D20** "Give this a clear structure with section divider slides (Introduction, Problem, Solution, Results, Next steps) and move the slides into those sections."

### 9.3 Medium: 3-4 changes in one message (steps lane)

- **M1** "Make slide 2 shorter, change the theme to dark, and add a thank-you slide at the end."
- **M2** "On slide 4 make the title bold and bigger, swap the picture for one of a team meeting, and add a fade transition to every slide."
- **M3** "Delete slide 6, move the pricing slide after the features slide, and turn slide 3 into a timeline."
- **M4** "Use navy and gold, change the fonts to something more modern, and add slide numbers at the bottom."
- **M5** "Add 2 more points to slide 5, write speaker notes for slides 1 to 3, and make the last slide's background a purple gradient."
- **M6** "Split slide 7 into two slides, then make both of them comparison layouts."
- **M7** "Add a slide after slide 3 about risks, make it a table with risk / impact / plan, and lock slide 1."
- **M8** "Translate slide 2 to Spanish, fix the grammar on slide 5, and make the heading on slide 8 centred."
- **M9** "Make the whole deck light mode, remove all animations, and give the title slide a photo of a city skyline."
- **M10** "Merge slides 4 and 5, shorten the result to 4 points, and add a chart from the table on slide 9."
- **M11** "Animate the bullets on slide 3 one by one, make the picture on slide 6 round, and bring the logo to the front."
- **M12** "Change 'Customers' to 'Clients' everywhere, make slide 2 a quote layout, and add a closing slide with our contact details."

### 9.4 Long: many changes in one message (steps lane, may mix in deck tasks)

- **L1** "Okay, a few things: the title slide needs a stronger heading, slide 3 has too much text so cut it in half, slide 5 should be a process with 4 steps, use our brand colours (navy #0B1F3A and orange #F47B20), make the fonts more modern, add a slide about our team after slide 6, put fade transitions everywhere, and add a thank-you slide at the end with our email."
- **L2** "Before tomorrow's board meeting: make the whole deck sound more executive, cut it to 12 slides, move the financials earlier (right after the summary), add a 'Key decisions needed' slide before the conclusion, write 1-minute speaker notes for each slide, and switch to a clean light theme."
- **L3** "Slide 2: make it a two-column comparison. Slide 4: replace the picture with something about teamwork. Slide 5: add 2 points about cost savings. Slide 7: delete. Slide 9: make the chart a bar chart. Slide 10: centre everything. Then add slide numbers and remove all the animations."
- **L4** "Make this deck more engaging for a school audience: simpler words, a question on the first slide, more pictures, a quiz slide before the end, bigger text everywhere, and bright colours."
- **L5** "Fix everything that looks off: text too long, text hard to read, slides that all look the same, missing titles. Then make the conclusion stronger with 3 recommendations, and add a sources slide at the end listing the links I attached."

### 9.5 One slide, long instruction (quick or steps lane, one slide only)

- **S1** "On this slide: make the heading a question, reduce the bullets to 3, make the picture bigger on the right, put the text on the left, and make the key number stand out in the accent colour."
- **S2** "Rewrite this slide for executives: one headline with the main insight, 3 short supporting points, and move the details into the speaker notes."
- **S3** "Turn this slide into a before/after comparison using only what it already says, and add a small arrow between the two sides."
- **S4** "This slide is crowded. Split it into two, keep the chart on the first one, and give the second one a timeline of the steps."

### 9.6 Messy and mixed-language (the reading step)

- **X1** "slide 3 bahut lamba hai usko chota karo aur ek photo bhi daalo coffee ka, aur theme thoda dark karo"
- **X2** "make it more profesional for investers and also the conclution is weak fix that pls"
- **X3** "same as before but for slide 5 also, and make tht one blue"
- **X4** "pura deck simple english me karo, students ke liye, aur end me ek summary slide add kardo"
- **X5** "cut the fluff. 10 slides max. keep all numbers. better titles."

### 9.7 Parts that must be refused or asked inside a long message (honesty)

- **H1** "Make it an investor pitch and add our revenue numbers and market size." (no numbers in the deck → placeholders plus a plain note, never invented)
- **H2** "Rewrite every slide and make slide 2 better too." (slide 2 is locked → everything else is done; slide 2 is named as locked)
- **H3** "Make the whole deck professional and add a video of our product." (video is not supported → the professional part is done, video refused in one line)
- **H4** "Add 50 slides about everything." (above the plan's slide limit → one question with the real limit)
- **H5** "Make it more professional." (sent while "This slide" is selected → only this slide, or one free question if the message clearly means the deck)

---

## 10. Build plan (slices; each built, tested and measured before the next)

| Slice | What | Proven by |
|---|---|---|
| 1 | Reading `parts` + part coverage + token budget that grows with the message | unit tests; X and L cases; nothing dropped |
| 2 | Steps lane: phase ordering, parallel waves, limit raised to 10 | unit tests (order, never the same slide at the same time); M and L cases; time before and after |
| 3 | Deck map + facts ledger + `transform` plan + plan checks + preview (no writing yet) | unit tests; D cases stop at the preview; plan quality read by hand on 5 real decks |
| 4 | Deck lane run: waves, brief and neighbour context, facts check and restore, one version | D1-D12 on the real model; facts ledger 100% |
| 5 | Pitch, story, minutes and ending shapes; job queue for big decks | D4, D5, D11, D12, D13-D20; tab-close test |
| 6 | "What changed" list with per-slide put-back in the panel | browser e2e |
| 7 | Full QA before and after on the same keys; then a request to switch the flag on | `docs/AI_FULL_QA_RESULTS.md` updated |

Measurements use the five-key free ring locally. To stay within the free limits, slice 4 onward runs the D cases in small groups.

## 11. Decisions needed from the owner

1. **Credits: decided and applied 2026-11-26** (docs/MARGIN_POLICY.md; owner rule: Pro 45-50%, Gold and Premium higher).
   - An edit message is 4 credits, plus 3 for each further slide written.
   - A whole-deck change is 10 credits for planning, plus 3 per slide written.
   - Code-only changes cost nothing extra.
   - The Flash credits double from 2027-01-01.
   - This supersedes option (d) in section 8.
2. **Pitch deck with no figures:** blanks such as `[your monthly revenue]` on the slide (recommended), or leave those slides out and list what is missing in the reply.
3. **Plans:** the deck lane on every plan that has AI edits (Pro and up), or only on Gold and Premium.


---

## Build record

### Slices 1 and 2: every part accounted for; phases and waves — built 2026-11-26
- `reading.ts`: the reading now returns `parts` (the separate requests, in order). `readingBlock` lists them for the understanding step, whose READING_RULE says: one task (or one "unsupported" entry) per part, with `phrase` = that part's words.
- `pipeline.ts`: when the understanding covers fewer parts than the reading found, ONE re-ask lists the parts (`<every part>`); what is still short is said in the answer ("I didn't do this part of your message: …"), chosen by `uncoveredParts` (word overlap, count-gated so a differently worded part is never falsely reported). The understand call's output budget grows with the parts (`900 + 250 × parts`, up to 3,000).
- `MAX_STEP` 4 → 10 (`proceed` confirms carry up to 10 tasks). Tasks run in `PHASE` order (structure → words → layout/objects → look → motion), each keeping its place in the message for `added_by_task`.
- Waves: inside the running order, writing tasks on different slides run at the same time (`WAVE` = 4); a task that changes which slides exist, a deck-wide task, a task on slides another task touches, or one aimed at slides an earlier task added runs alone. Results merge in running order.
- Tests: `assistant.test.ts` "a long message…" (coverage re-ask, phases, waves, ten in one go).

### Slices 3 and 4: the deck lane (`transform`) — built 2026-11-26
- `transform-plan.ts`: the plan's shape (zod), shared by the route's `confirm` schema and the capability; `transformWrites` = the slides a plan writes (the price).
- `capabilities/transform.ts`: PLAN (deck map by code: words, layout, figures per slide, review findings, what may not be touched; one quality call; `checkPlan` with one re-ask; the preview with the price) and APPLY (the plan checked again; text/layout/notes written in waves of 4 with the shared brief and the neighbours' titles; every written slide must keep every figure the slide had, or it is asked again and then left as it was; new slides written from the deck's material with blanks where it has none; section dividers; deletes; the fewest moves for the new order, computed over the sequence the editor will have after it adds slides).
- Pricing: the plan call is one unit (refunded as a question); the confirmed plan charges base + written slides − 1; `keep` slides are free and the answer says so.
- The understanding guide names the family; the prompt budget test moved from 3,500 to 3,700 tokens for it.
- Tests: `assistant.test.ts` "the deck lane…" (plan, re-ask on a locked slide, price line, figure-keeping retry, adds, reorder, stale plan, plan limits, `minimalMoves`); scenario catalogue (`scenarios.ts`: transform-asks-first, -success, -adds-and-reorders, -stale-plan, -locked-kept) through the real pipeline and editor commands; e2e `112-ai-deck-lane.mjs` on the real model (see the note below).

### Changes from the plan above (better than written)
- The facts ledger is the slide's FIGURES (numbers, percentages, years, amounts), compared by code before and after each written slide. Names and quotes are not in it: a name check by code would produce false "dropped" reports on legitimate rewording, and the content sanitiser already stops invented names. A figure can only disappear with a slide the plan deletes, and the preview says so with the figures listed.
- Merge and split are not plan actions in this version: a merge is expressed as "delete + rewrite note" (its figures are listed as going), which keeps the plan checkable by code. The `combine` family still does merge/split on request.
- The whole-deck change runs inside the request (no job queue yet): the writing is in waves of 4 calls, so a 30-slide rewrite is about 2 rounds. A job queue (closing the tab loses nothing) is still open for very large decks.
- The "What changed" per-slide put-back already exists as the `undo` family with `part: slide`.

### What the first real-model run taught (2026-11-26, free keys nearly exhausted)
- The planner added `notesSeconds` on its own, which changed the price: code now drops notes unless a talk length was asked (`checkPlan`), and a confirmed plan keeps what it carries.
- One writing batch failing (the AI busy) used to fail the whole confirmed plan with a 503: now each batch's slides are reported as not done ("the AI service was busy; ask again for this slide") and the rest still land.
- The plan itself came back well-formed from the real model (one action per slide, keeps, a price line); the writing could not be proven because every free key was out of quota for Gemini 3.6 Flash.

### Open
- The real-model e2e (suite 112) could only run on the free key ring when its daily quota allows; see the result note in the memory file.
- Job queue for decks over about 30 written slides; merge/split as plan actions; the D/M/L/S/X/H prompt set as e2e cases with code checks (needs the paid key or a day of quota).
