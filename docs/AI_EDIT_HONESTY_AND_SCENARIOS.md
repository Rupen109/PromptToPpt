# Edit with AI: no fake answers. Rules, every scenario, and the architecture (proposal, 2026-11-19)

**Status (2026-11-20): APPROVED by the owner; P0 to P4 are built and tested. Sections 11 to 26 are the build record; section 27 is the point-by-point coverage audit against this whole document and the list of what is still open. Sections 6 and 7 are the ORIGINAL proposal tables (the "AI today" columns are historical): read section 27 for the current state.** Written after the owner's report: *"I say remove background, nothing happens, the chat says the image is removed. That is a fake answer and a big red flag."*
This builds on the approved assistant design (`docs/AI_ASSISTANT_V2_ARCHITECTURE.md`: understand, resolve, do, check, validate). That design is good; it has one missing floor, described in section 1.

Evidence tags: **[code]** read in the source. **[run]** run just now with the real code. **[to verify]** not checked; needs a look before we promise it.

---

## 0. In one page

1. **Why the chat can say "Done" when nothing changed.** The sentence the person reads ("Removed the background of the picture on slide 1") is written when the change is *planned*. The editor then applies the change, and **if it cannot (locked slide, the picture is no longer there, it is not an image any more, a template slide) it silently does nothing, and the chat still shows the green tick.** Nobody ever compares the deck before and after against what was claimed. [code + run, section 1]
2. **Why "unsupported" is unreliable.** What the assistant can and cannot do lives in a prompt (prose) and in the model's judgement. A request the assistant cannot do (move an object, add a table row, change a chart type) may be mapped to the *nearest* thing it can do, and the reply then describes that. There is no list in code that says "this is supported, this is not". [code]
3. **Why "make it bigger" cannot work today.** The assistant only knows slides. It is never told which element is selected, so "this image", "it", "make it smaller" have nothing to point at. [code]
4. **The fix is one new floor, not more patches:** every change is a typed operation; the editor's own commands apply it and **report what they did**; a verifier compares before and after; **the message is built only from verified results**; unsupported things are refused by code with a plain sentence; credits are refunded when nothing really changed. Section 3.
5. **Then we widen what the assistant can do, in phases, and a capability is only advertised when its scenario tests pass.** Section 6 lists every scenario you wrote, what exists today, and the exact honest answer.

**What I need from you:** approve section 3 (the architecture) and the order in section 7, and answer the seven questions in section 8.

---

## 1. Root cause, with proof

| # | Cause | Where | Effect |
|---|---|---|---|
| C1 | **The claim is written at planning time, not from the result.** Capabilities return `applied` lines when they plan the change; the server sends them as the answer; the editor shows them as ticks. | `assistant/capabilities/*.ts` (e.g. `look.ts` builds "Removed the background of the picture on slide N"), `routes/presentations.ts` (`replyFor`), `AiPanel.tsx` (`res.applied` rendered as ticks) | "Done" is a promise, not a fact. |
| C2 | **The editor applies changes fire-and-forget.** `applyAssist` calls each command and ignores whether it did anything; `swapPicture` etc. return nothing and quietly `return` on a locked slide, a missing element or a wrong element type. The editor has `before` and `after` snapshots and never compares them to the claim. | `apps/editor/src/editor/commands.ts` (`applyAssist`, `swapPicture`), `AiPanel.tsx` (`didEdit` only checks that the response *contained* operations) | A change that does not land is still reported as done. |
| C3 | **The support boundary is prose.** The list of what can be done is a text guide inside the model's prompt; `unsupported` is whatever the model writes. | `assistant/understand.ts` (`FAMILY_GUIDE`, `unsupported`) | Unsupported asks can be answered with a nearby supported action. |
| C4 | **No selection, no elements, no template kind.** The request carries a slide and a scope, not the selected element(s); the deck state has slides, not elements; Morph/own-template slides are not described. | `assistant/state.ts`, `AiPanel.tsx` (`activeSlideId`, `scope`) | "this", "it", object-level edits and template rules cannot be handled. |
| C5 | **Credits are decided before the result is known.** The server charges on the plan; it cannot know the editor did nothing. | `routes/presentations.ts` | A person can pay for a change that did not happen. |

**Proof of C1+C2, run just now with the real editor code** (a server answer claiming "Removed the background of the picture on slide 1" applied to four situations):

| Situation when the answer arrives | What the chat would say | What the picture really is |
|---|---|---|
| normal slide (control) | Removed the background... | cut-out applied (correct) |
| slide is locked | **Removed the background...** | **unchanged** |
| the picture was deleted meanwhile | **Removed the background...** | **gone, nothing replaced** |
| the element is no longer an image | **Removed the background...** | **unchanged** |

I could not reproduce your exact chat (I do not have your deck), so I do not claim to know which row you hit. Slides that are part of an animated template, a picture the owner does not own, and the removal feature being development-only in production are other ways to land in "claimed but not done". The structural point is the same: **today nothing stops any of them.** (The server-side cut-out itself is honest: it only lists a picture as done if the cut-out succeeded. The lie happens in the second hop, the editor.)

---

## 2. The Honesty Contract (the rules; each one is enforced in code, not asked of the model)

| # | Rule | How it is enforced |
|---|---|---|
| R1 | **No claim without evidence.** A change is reported only if a verifier, comparing the deck before and after, confirms it. | Verifier per capability; the reply composer reads only verified results. A test fails if any claim has no evidence. |
| R2 | **Report what actually happened, per item.** "3 of 4 pictures", "slide 2 is locked so I skipped it". | Each operation returns `{changed, skipped[{what, reason}]}`; the message lists both. |
| R3 | **Say "not supported" in code, with a reason and an alternative.** | A capability registry decides support; the model can only choose registry entries or "none". Wording comes from the registry. |
| R4 | **Never swap in a different action.** If the ask is "make the logo smaller" and no capability does it, the answer is "not supported yet", never "I changed the layout". | The registry check happens before anything runs; an operation whose capability does not accept the target kind is refused. |
| R5 | **One short question when it matters.** "Make it bigger" with nothing selected and no clear reference asks once. If a sensible reading exists, act and say which reading was used. | Resolution rules (section 4.3); the question is code-generated from what is ambiguous. |
| R6 | **Preserve everything not asked for.** A theme change does not rewrite content; a text change does not touch the design. | Each capability declares what it may touch; the verifier also checks nothing else changed ("no collateral edits"). |
| R7 | **Never invent data.** No made-up numbers, statistics, chart values, quotes, facts. If data is missing the assistant asks or marks a placeholder. | Writing capabilities receive only facts present in the deck/sources; a check flags new numerals that are not in the deck or the sources; flagged text is not applied. |
| R8 | **Every change is undoable in one step.** | The existing editor history; one undo step per message. |
| R9 | **Confirm before destructive bulk actions**, with a clear undo path. | Policy table (section 4.5): e.g. delete 3+ slides, replace all pictures, rewrite most of the deck. |
| R10 | **Respect locks, plans and flags, and say so.** Locked slide, plan-gated feature (animations on Gold/Premium), development-only feature. | Checked before running; the message says exactly which and why. |
| R11 | **Templates are not broken.** Rules per slide kind (section 5). | Slide kind is part of the state; capabilities declare what they allow on each kind. |
| R12 | **Pay only for verified work.** Nothing changed = refunded automatically. | The editor reports the verified outcome; the server refunds (idempotent). |
| R13 | **Tell the truth about cost and time.** "This will generate an image (costs credits). Continue?" | Writing/generation capabilities declare their cost; shown before they run. |
| R14 | **The model never writes the result message.** The model understands and writes content; the sentence "I did X" is built by code from the verified result. | Reply composer (section 3). |

### Answer shapes (the only five ways the assistant ends a request)

| Outcome | Looks like |
|---|---|
| **Done** | "Done: changed the theme to dark and set Poppins on all headings (12 slides)." (every part verified) |
| **Partly done** | "Done on 3 of 4 pictures. Slide 2 is locked, so I left it. Unlock it and ask again, or I can unlock it for you." |
| **Not done** | "I could not do that: the picture on slide 1 is no longer there. Nothing was changed." |
| **Not supported** | "I cannot align or distribute shapes yet, so I did not change anything. You can do it in the editor with the Align menu. I can: move a slide, change its layout, ..." (alternatives come from the registry) |
| **One question / confirmation** | "Which picture do you mean, the one on the left or the right?" / "This deletes 4 slides (you can undo). Delete?" |
| **Nothing to change** | "The presentation is already in dark mode, so I left it as it is." |

---

## 3. The architecture: one new floor under the approved v2 design

```
 message + selection (slides, elements) + active slide + scope
        │
   STATE   deck facts: slides, ELEMENTS, slide KIND (normal / animated template / own-template), locks, plan, flags, selection
        │
   UNDERSTAND (cheapest model)  -> a plan of TYPED operations, each naming a REGISTRY capability (or "none")
        │
   RESOLVE (code)  scope + targets (selection, slide numbers, "previous", "all"); ask ONE question only if truly ambiguous
        │
   ADMIT (code, NEW)  registry check: supported? target kind accepted? slide kind allows it? locked? plan/flag? cost?   -> Not supported / Partly / confirm
        │
   DO (the EDITOR's own commands, NEW: they return results)   one undo step
        │
   VERIFY (code, NEW)  compare BEFORE and AFTER against each operation's expectation; detect collateral changes
        │
   REPORT (code, NEW)  message built ONLY from verified results; outcome sent to the server -> refund if nothing changed
```

### 3.1 Capability registry (single source of truth, in code)
One entry per thing the assistant can do. Each entry declares: an id and a plain description (used to *generate* the model's guide and the "what can I do" answer, so they can never drift); the **scopes** it works on (element / slide / selected slides / deck); what it **needs** (a selection, a plan feature, a flag, credits); its **template rules** (allowed / text-only / refuse, per slide kind); the **editor commands** that perform it; its **verifier** (what must be true afterwards); and its **claim and failure wording**. A request that maps to no entry is "Not supported" by code (R3, R4). Adding a capability = adding one entry + its scenario tests; it appears in "what can I do" only when its tests pass.

### 3.2 Typed operations, not prose
The plan is a list like `[{id:1, capability:'theme.mode', scope:{deck}, values:{mode:'dark'}}, {id:2, capability:'type.font', scope:{deck, role:'headings'}, values:{font:'Poppins'}}, {id:3, capability:'slide.add', ..., dependsOn:[]}]`. Multi-step messages run in dependency order (the existing `added_by_task` idea, generalised); each operation is verified on its own, so "four things in one message" can end as "3 done, 1 not supported" honestly.

### 3.3 Editor commands return results (no parallel implementation)
The AI uses **the same commands the toolbar uses** (`swapPicture`, `setGeometry`, `addEffect`, `setSlideBackground`, ...). Today many return nothing. The change is small and structural: each command returns `{changed: number, skipped: {id, reason}[]}` (e.g. `swapPicture` returns `skipped: [{slide 1, 'locked'}]`). Commands that cannot yet report are wrapped by a before/after diff. This also helps the UI itself (a toolbar action that silently does nothing is the same bug).

### 3.4 Verifier
A pure function per capability: `(before, after, operation) -> {status: done | partial | unchanged | failed, changed, skipped, evidence}`. Examples: *theme.mode*: the theme's background/foreground luminance flipped. *picture.cutout*: the element's `src` differs from before and points to a transparent PNG we stored. *type.size*: the run sizes of the targeted text equal the request. Plus a **collateral check**: elements and content outside the declared target are unchanged (R6).

### 3.5 Reply composer + outcome report
The chat message is assembled in the editor from verified results and the registry's wording; the server's reply text is shown only for answers and chat. After applying, the editor posts the **outcome** (`requestId`, per-operation status). The server records it and **refunds credits when nothing was verified** (R12), and the AI usage ledger gains `verified_changes` (so we can measure honesty: claimed vs verified, per capability, in production).

### 3.6 Context
The request now carries `selection: {slideIds, elementIds}` in addition to `activeSlideId` and the scope. The state describes the selected elements (id, type, role, position, size, text/src summary) and a compact element map of the current slide, so "this image", "it", "make it bigger", "remove it", "align these" resolve in code (section 4.3).

### 3.7 Scenarios are data, and they are the tests
The catalogue in section 6 becomes `assistant/scenarios.ts`: each row has example phrasings, the perfect understanding, the deck setup (including locked / template / missing / plan-gated variants) and the **expected outcome class**. Three suites run it with the existing free offline harness (`apps/editor/scripts/offline-ideal.ts`, no AI cost): **(a) golden**: perfect understanding through the real pipeline, editor and verifier gives the expected result; **(b) honesty property**: random sequences of operations on random decks (with locks, missing elements, template slides) must never produce a claim without evidence; **(c) refusal**: every "not supported" row must end as Not supported, never Done. A small, owner-approved real-model sample checks understanding. The homepage promise "the assistant can do X" is generated from rows that pass.

---

## 4. Rules for scope, ambiguity, safety

### 4.1 Scope (every instruction is classified)
| Scope | Typical words | Resolved from |
|---|---|---|
| **Element** | "this image", "make it bigger", "the heading", "remove it" | the selection; else a unique match on the current slide ("the chart" when there is one); else ask |
| **Current slide** | "this slide", "make it less crowded" | the active slide |
| **Selected slides** | "these slides", "slides 2 to 5", "the financial ones" | selection or numbers/titles |
| **Deck** | "all", "every slide", "the whole presentation", theme/fonts/brand/transitions | explicit |

### 4.2 Reference resolution
Numbers and ranges ("slide 3", "2 to 5"), position ("previous", "next", "last two"), titles ("the pricing slide"), "just changed" (what the assistant changed last), attachments, URLs, and the last turns of the chat. **A reference supplies content and/or design as asked** ("use slide 3's layout" copies the structure and style, not its words; "use slide 4's content" copies the facts, not its look). A reference that matches nothing is asked about, never guessed.

### 4.3 When to ask, when to act, when to confirm
| Situation | Behaviour |
|---|---|
| Clear request, one sensible reading | Act. State the reading used if it was a choice ("I made all headings 28 pt"). |
| Two readings give very different results and nothing decides it | Ask one short question with buttons. |
| "Make it bigger" and nothing selected / referenced | Ask once ("Which element?"). |
| Vague taste ("make it look better") on a slide | Act on the slide (layout/hierarchy/space), say what was changed, offer undo. |
| Destructive: delete 3+ slides, remove all pictures/animations, replace all pictures, rewrite more than half the deck | Confirm first (count shown), then do it as one undoable step. |
| Costs credits beyond a normal edit (image generation, many slides written) | Say the cost, confirm. |
| Locked slide / plan-gated / development-only | Skip that part, name the reason, offer the way forward. |

### 4.4 Safety
No unrelated changes (verified). No invented data (R7). One undo step per message. A failed operation never leaves a half change: the step is applied as a whole or reported as not applied.

---

## 5. Existing templates (Morph animated templates, template pictures, "own product" decks)

Every slide has a **kind**: *normal*, *animated template slide* (Morph: the scenes share artwork and the transition moves it), or *own-template* (a deck made from the owner's file). The registry declares what each capability may do per kind; the assistant says why when it refuses.

| Request | Normal slide | Animated template slide | Own-template slide |
|---|---|---|---|
| Change text | yes | yes (the template's text boxes) | yes |
| Replace / generate a picture | that slide | **replaces that artwork on every scene that uses it** (the Morph moves one picture); the message says "on all N slides" | per its slots |
| Remove background of a picture | that picture | same rule as replace (the cut-out replaces it everywhere, said so) | that picture |
| Delete the picture itself | yes | refused: "this picture is part of the template animation; replace it instead" | per its slots |
| Change layout | yes | refused: "the layout is part of the template; I can change the template or its text" | refused unless its slots allow |
| Move/resize objects | yes | refused for template artwork; allowed for text within its limits | per its slots |
| Theme colours / fonts | yes | applied through the template's own palette; says what could not change | yes |
| Slide transition | yes | the Morph transition is kept (changing it is refused with the reason) | yes |
| Add slide | composed in the deck's design | adds a scene of the same template, or says it cannot | in the file's design |
| Delete / duplicate / move slide | yes | allowed, warns if it breaks a Morph sequence | yes |

Rule: **the assistant never "works around" a template by rebuilding it as a plain slide.** If a request needs that, it says so and offers it as an explicit choice.

---

## 6. Scenario catalogue (every kind of request you listed)

Status columns: **Editor** = can the editor itself do it (a command/UI exists). **AI today** = does the assistant do it now. Legend: ✅ yes · ◐ partly (limit named) · ❌ no · ❓ [to verify].
**Target** = phase in section 7 (P0 first). **If not available, the honest answer** is the registry's wording.
The assistant today has 18 capability families: text (incl. speaker notes), layout, add/remove/move/duplicate/lock slide, background, readability, picture (add/remove/cut-out), refresh pictures, palette, template, fonts, motion (whole deck), undo, rewrite deck, enrich-from-sources; plus questions and chat. It has **no element-level, shape, table, chart, per-object animation, transition, brand or alignment capability**.

### 6.1 Theme, design, branding
| Request cluster (examples) | Scope | Editor | AI today | Target | Honest answer when not available |
|---|---|---|---|---|---|
| Theme dark / light | deck | ✅ | ✅ (palette mode) | done | n/a |
| Style words: premium, minimalist, corporate, futuristic, glassmorphism, gradient, bold, "investor pitch look" | deck | ✅ (templates, designs) | ◐ picks the closest available design | P1 | "The closest design I have is X (minimalist, serif). I don't have a glassmorphism design; want X?" Never claims the named style if not available |
| "Consistent design across all slides" | deck | ✅ | ◐ | P1 | says what was made consistent (backgrounds, fonts, spacing) |
| Apply my saved brand / uploaded colours / logo | deck | ✅ (Brand tab: kits) | ❌ | P1 | "I can't apply your brand from chat yet: open the Brand tab and choose it. I can set these colours/fonts now: ..." |
| Brand from my website URL / logo | deck | ◐ ❓ (brand kit extraction) | ❌ | P3 | same; never invents colours it did not read |
| Logo on every slide / bottom-right | deck/slide | ◐ ❓ (brand logo) | ❌ | P1 | "Logo placement is not available from chat yet" |
| Colours: background black/white/beige/gradient; accent colour; palette; contrast | slide / deck | ✅ | ✅ (background, palette, readability) | done | n/a; "transparent background" is refused (not a thing for slides) |
| Different background per section | slides | ✅ | ◐ (per slide yes, "sections" need slide grouping) | P1 | applies per named slides; says sections are not a concept yet |
| Fonts: named font (Poppins, Inter...) | deck | ✅ (catalogue) | ◐ only fonts in our pair list | done/P1 | "Poppins isn't in our font list; closest are A, B" (never claims Poppins) |
| Font size, bold, weight, uppercase, line spacing, per element or per role | element/slide/deck | ✅ (text commands) | ❌ | P0/P1 | "I can't change text sizes from chat yet" until built |
| Typography hierarchy / readability | slide/deck | ◐ | ◐ (readability) | P1 | states what was adjusted |

### 6.2 Slide management and structure
| Request | Scope | Editor | AI today | Target | Honest answer when not available |
|---|---|---|---|---|---|
| Add slide (generic: title, agenda, overview, features, market, competitors, model, financials, roadmap, case study, team, testimonials, summary, conclusion, thank-you, contact, Q&A) | slide | ✅ | ✅ (add_slide with topic) | done | content only from the deck/sources; no invented figures |
| Add slide before/after a given slide, same layout as slide N | slide | ✅ | ◐ (after yes; "before" via position; layout copy by layout name) | P1 | says what could not be copied |
| Context-aware thank-you / closing / summary / section divider / comparison / next steps | slide | ✅ | ◐ (composes in current theme; summary from deck ✅; logo/contact details ❌) | P1 | lists what it used and what is missing ("no contact details in your deck: add them or tell me") |
| Delete / duplicate / move (start, end, after N) / swap two | slides | ✅ | ✅ (swap = two moves ❓) | done | n/a |
| Delete all empty slides / remove duplicate slides | slides | ✅ | ❌ (needs analysis) | P4 | confirm with the list first |
| Reorder by flow / group related / sections / keep best 5 / merge two / split one | deck | ◐ | ❌ | P4 | "I can't merge slides yet" etc.; offers the supported subset |
| Redesign / simplify / reduce text / more white space / less crowded / two or three columns / centre | slide | ✅ | ◐ (layout + text shorten) | P1 | states what changed; "centre" of one object needs element scope |

### 6.3 Text and content
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Change heading text, rewrite, shorten, expand, simplify, tone (professional, persuasive, conversational), grammar/spelling, bullets ↔ paragraph, subtitle, opening statement, remove repetition | element/slide/deck | ✅ | ✅ (text) | done | n/a |
| Audience (investors, executives), translate | slide/deck | ✅ | ✅ | done | n/a |
| Data-driven, add statistics, add real-world example, value proposition, key takeaway | slide | ✅ | ◐ | P1 | **R7: statistics only from your deck/sources; otherwise a clearly marked placeholder or a question, never invented numbers** |
| Storytelling, flow, "identify missing information", "suggest improvements" | deck | n/a | ◐ (question answers) | P4 | review is advice, not an edit; says so |

### 6.4 Images and media (high priority)
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Replace picture with a stock/relevant one, product photo, modern office; "find a better image" | element/slide | ✅ | ✅ (photo from free libraries) | done | says if none found; template pictures replaced on all scenes |
| Replace all pictures with relevant ones | deck | ✅ | ✅ (refresh pictures) | done | confirm (R9) |
| Replace with the uploaded image | element | ✅ | ❌ | P1 | "pick it from My uploads for now" |
| **Remove the background of this image / keep only the product / make transparent** | element | ◐ **development only** (no approved model) | ◐ dev only | **blocked by licensing** | **In production: "Removing a picture's background is not available yet, so nothing was changed."** Never "done". (Production blockers: `PRODUCTION_RELEASE_CHECKLIST.md`) |
| Generate image / mockup / illustration / hero / 3D / abstract background | slide | ✅ | ✅ (AI image, credits) | done | cost confirmation (R13) |
| Crop, fit, resize, move, round corners, circle, shadow, brightness/contrast, dark-themed version | element | ◐ ❓ (geometry, radius yes; crop/filters ❓) | ❌ | P1/P2 | per item: "crop isn't available yet" etc. |
| Same image style everywhere, different image per slide | deck | ◐ | ◐ | P2 | states what was done |
| Video: add, replace URL, thumbnail, play button | slide | ❌ | ❌ | not planned | "Video isn't supported in presentations yet." |

### 6.5 Shapes, icons, tables, charts
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Add rectangle/circle/line/arrow/divider/border/icon; colour, transparency, border, corner radius, gradient, delete, duplicate | element | ✅ (add/update/duplicate/delete) | ❌ | P2 | until built: "I can't add or edit shapes from chat yet; use the Insert menu" |
| Align (left/centre/right), distribute, group/ungroup, bring to front/send back | elements | ◐ align ✅ ❓, distribute/group/layer ❌ not found in the command layer | ❌ | P2 (align), editor feature first for the rest | "Distributing/grouping isn't available in the editor yet" (honest about the editor, not just the AI) |
| Process diagrams, timelines, circular process (built from shapes) | slide | ◐ (layouts: timeline, process) | ◐ (layout) | P2 | built-in layouts only; says "I used the timeline layout" |
| Tables: add/convert content to table, add row/column, remove, sort, highlight max, style, brand colours, number formats, update with data/spreadsheet | slide/element | ✅ (table element + dialog) | ◐ (table layout from text) | P2 | editing an existing table's cells/rows from chat = not yet; data only from the deck/sources/attachment |
| Charts: add bar/line/pie/donut/stacked, convert table to chart, change type, colours, labels, legend, sort, trend line, insights | slide/element | ✅ (chart element) | ◐ (chart layout from text) | P2 | **values only from the deck or the attached data; never made up**; "trend line isn't available" if not |

### 6.6 Position, size, alignment (element level)
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Move left/right/top/centre/below; make bigger/smaller; resize without distortion; set font size 32; equal spacing; centre all; align across slides; margins; symmetrical | element/slide/deck | ✅ (geometry, snap) | ❌ (no selection) | **P0** | until built: "I can't move or resize objects from chat yet; drag them or use the Format bar" |

### 6.7 Animations and transitions (high priority)
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| One animation style for the whole deck ("animate every slide", subtle, none) | deck | ✅ | ✅ (motion presets) | done | n/a |
| Per-object animation (fade, fly, zoom, bounce, pulse, typewriter, spin, grow, float, exit), duration, delay, repeat, easing, trigger, order, "one by one", "together", remove | element/slide | ✅ (effects system) **Gold and Premium only** | ❌ | P3 | "Object animations are a Gold feature" when the plan lacks it; never silently skipped |
| Slide transitions: fade, push, wipe, zoom, none, duration, same on all, per section; **Morph** | slide/deck | ✅ (none/fade/slide/zoom/push/wipe; Morph Gold+) | ❌ | P3 | "I can set X; Morph needs Gold" |

### 6.8 Layouts and templates
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Change a slide to two-column / full-width image / comparison / timeline / process / big statistic / quote / product / problem-solution / split | slide | ✅ | ✅ (layout) | done | refused when the content does not fit ("this content has 7 points; comparison holds 6") |
| Same layout as slide N / apply to slides 2-4 / best layout for this content / improve every slide's layout | slide(s) | ✅ | ◐ | P1 | says which were changed |
| A more modern template / template matching my brand | deck | ✅ | ◐ (template) | P1 | named template must exist, else closest offered |
| Existing animated (Morph) template | deck | ✅ | ◐ | see section 5 | rules in section 5 |

### 6.9 References, links, uploads
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Use slide N / previous slide / the intro as design or content reference; summarise slides 2-5; combine 3 and 4; take the chart from slide 6; use the image from slide 3 | slide | ✅ | ◐ (slide numbers resolve; copy of design/chart/image parts not wired) | P2 | says what was taken ("took the facts of slides 3 and 4, in the deck's design") |
| Uploaded PDF / document / PPT / Excel / image / report / logo | deck | ◐ | ◐ (PDF/link sources, enrich ✅; spreadsheet, PPT, image-as-reference ❓) | P3 | per file type: what it can read; never claims it read a file it did not parse |
| Website URL: create slide, extract product details, brand colours/fonts, competitor comparison, source link in notes, latest information | deck | ◐ | ◐ (links read; brand extraction ❌) | P3 | "I read these pages: ... I could not read: ..." (existing behaviour kept) |
| Chat references ("as before", "the same image style", "the last generated slide") | any | n/a | ◐ (last 4 turns, recent changes) | P1 | asks which if it cannot tell |

### 6.10 Presentation-wide
| Request | Scope | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|---|
| Theme, all heading fonts, brand colours, consistent backgrounds, all transitions, all animations, all alignment | deck | ✅ mostly | ◐ (theme/palette/fonts/motion/background yes; sizes, transitions, alignment ❌) | P0-P3 | per item |
| Footer text, slide numbers, company logo on every slide | deck | ◐ ❓ (numbers/footer appear only in export code) | ❌ | needs editor feature | "Footers and slide numbers aren't an editor feature yet" |
| Rounded images everywhere, same chart palette, same image style | deck | ◐ | ❌ | P2 | per item |
| Reduce to 10 slides / expand to 15 / investor-ready / client-ready | deck | n/a | ◐ (rewrite deck owner-only) | P4 | confirm (R9); preserves data; lists what was cut |
| Check and fix inconsistent font sizes / alignment / contrast | deck | ◐ | ◐ (readability only) | P4 | reports what it checked and fixed |

### 6.11 Speaker notes and delivery
| Request | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|
| Notes for this slide / every slide, conversational, script, talking points, timing, intro/closing, transitions between slides, audience questions and answers | ✅ (speaker notes) | ◐ (text family covers notes) | P2 | says how many slides' notes were written; timing estimates are labelled estimates |

### 6.12 Review and quality (proactive)
| Request | Editor | AI today | Target | Honest answer |
|---|---|---|---|---|
| Review the deck, find too-much-text slides, inconsistent fonts/colours, alignment issues, duplicates, missing sections, weak intro/conclusion, grammar | ◐ (validators, a review dialog) | ◐ (can answer questions) | P4 | a *report* with slide numbers and one-click fixes; the report only lists what code checks found, plus clearly-labelled suggestions |

### 6.13 Multi-step and vague requests
| Request | AI today | Target | Honest answer |
|---|---|---|---|
| "Dark theme, Poppins, thank-you slide, fade transitions" (several things) | ✅ up to 6 tasks | P0 (honest per-part result) | "3 done; fade transitions aren't available from chat yet" |
| "Make it better / premium / less crowded / fix what looks wrong / match the previous slide" | ◐ | P1 | acts on the slide, states what changed, offers undo; if nothing selected and nothing to infer, one question |

---

## 7. Build order (each phase is finished only when its scenarios pass in the three suites)

| Phase | What | Why this order |
|---|---|---|
| **P0 Honesty floor (no new features)** | Typed results from editor commands; verifiers for the 18 existing capabilities; reply composer from verified results; outcome report + automatic refund; registry-driven "not supported" and "what can I do"; scenario suites (golden, honesty property, refusal) | Fixes the red flag first. Everything later inherits it. |
| **P1 Context** | Selection and element map in the request/state; element-level text size/weight/colour, move/resize/align (one slide); brand apply; picture replace from uploads; vague-request behaviour | The owner's P0 list ("this", "make it bigger") |
| **P2 Objects and data** | Shapes, icons, tables, charts (data only from deck/files), picture styling; speaker notes depth; references to existing slides (copy design/content/chart/image) | |
| **P3 Motion and sources** | Per-object animations and transitions (with plan gates); uploads (PDF/Excel/PPT) and URLs, brand from website | |
| **P4 Deck-level intelligence** | Review report, reorder/merge/split, shorten/expand deck, consistency fixes | Needs P0-P3 as building blocks |

Editor features that do not exist yet and must be built in the **editor** before the AI can promise them (they are not AI work): distribute, group/ungroup, layer order ❓, footer/slide numbers, crop and image filters ❓. Until then the answer is "the editor can't do that yet".

---

## 8. Decisions I need from you

1. **Approve the architecture** in section 3 (typed operations, results from editor commands, verifier, message built from verified results, outcome report).
2. **Credits for an unchanged result: refund automatically?** (recommended: yes, R12).
3. **Confirmation thresholds** (section 4.3): delete 3+ slides, replace all pictures, rewrite more than half the deck. OK, or different numbers?
4. **Plan-gated features** (object animations and Morph are Gold/Premium): when a Pro user asks, the assistant says it is a Gold feature and offers the upgrade. OK?
5. **Remove background in production**: keep answering "not available yet" until a provider is approved (current behaviour, now guaranteed by the verifier). OK?
6. **Order**: P0 then P1 as above, or do you want object animations/transitions before element editing?
7. **Quick actions** (Edit / Design / Create / Animations chips): generated from the registry so a chip appears only for capabilities that pass their tests. OK?

## 9. What is NOT claimed here
The coverage table is based on reading the code; rows marked ❓ were not checked (crop, image filters, layer order, footers/slide numbers, brand extraction, spreadsheet/PPT parsing, swap-two-slides). I did not reproduce your exact chat; I reproduced the mechanism (section 1). No code was changed for this document. No real AI call was made.


---

## 10. Revised technical plan (approved scope plus the owner's seven additions)

### 10.1 What changed from the proposal, and why
| Owner requirement | Design decision |
|---|---|
| 1. One transaction per request; safe rollback; keep independent successes; report partial accurately | The answer is applied as an ordered list of **steps** (one per change: theme, one slide edit, one addition, one move...). A **dry run** on a plain copy applies each step on its own (a step that throws changes nothing, immer is atomic per step), then the surviving steps are committed in **one** `apply()` = one undo/redo step. Independent steps survive a failed neighbour; a step that needed a failed one is reported as failed (its target is missing). The result is **verified on the committed document**, not on the dry run. |
| 2. Verify real editor state | Every change carries an **expectation** (small JSON: slide, element, the value that must be there afterwards, and the facts from before). A pure `evaluate(expectation, document)` checks the **document**, never a command's return value. For a cut-out: the right element of the right slide now holds the new picture, it is still an image, it differs from the old one, AND the stored PNG really has transparency (measured on the server when it is made, and measured again from the stored bytes when credits are settled). |
| 3. Secure credits | Settlement is **decided by the server, from the saved document**, with the same `evaluate`. The client's report only *triggers* settlement; its claimed results are stored for telemetry and are never used to decide money. Idempotent by the unique `requestId`; one row per request in a new table; exact policy for partial completion and external costs (10.4). A sweeper settles requests whose client never reported. |
| 4. Capability discovery | New intent `help`. The reply is **generated from the capability registry plus the person's plan, the feature flags, the slide kind and the current slide**, never written by the model. |
| 5. No false availability | A capability is listed and runnable only if it is `ready` in the registry AND has a verifier AND is covered by scenario tests (a test enforces the three), AND its flag, licence approval, template rule and plan allow it. Background removal stays development-only (flag + the provider allow-list); in production it is listed as "not available". |
| 6. Preserve the architecture | The existing `CAPABILITIES` map is **extended** (metadata per capability), not replaced; the existing editor commands do the work; `applyAssist` keeps its signature and is rebuilt on top of the new steps; the existing store, undo/redo, `compileAssist`, ledger and refund helpers are reused. |
| 7. Tests | Section 10.5. |

### 10.2 Exact files (P0)
**New**
| File | Purpose |
|---|---|
| `packages/theme/src/assist/expectations.ts` | the `Expectation` types; `expectationsFromChanges(before, changes)` builds them from one assistant answer (it already knows the facts from before) |
| `packages/theme/src/assist/evaluate.ts` | pure `evaluate(expectation, doc)` returning `{status, changed, skipped[], evidence}`; shared by the editor and the server |
| `packages/theme/src/assist/claims.ts` | the only place that words a result ("Changed the colours", "Slide 2 is locked, so I left it") from verified results; the five answer shapes |
| `packages/theme/src/assist/*.test.ts` | evaluator and claim tests (success, partial, failed, locked, missing, nothing-to-change) |
| `apps/editor/src/editor/assist-apply.ts` | `assistSteps(changes)`; `applyAssistVerified(...)`: dry run, one transaction, verification on the committed document |
| `apps/editor/src/editor/assist-apply.test.ts` | transaction, rollback, undo, redo, partial, locked, missing element, multi-step |
| `services/api/src/assistant/registry.ts` | capability report (discovery), requirement checks (plan, flag, template, owner, sources), unsupported alternatives |
| `services/api/src/assistant/settle.ts` | `settlementPlan` (pure money policy), `settleAssistRequest` (idempotent, server-side verification), `settleStaleRequests` (sweeper) |
| `services/api/src/assistant/scenarios.ts` | the scenario catalogue as data (capability, class, expected outcome) and the coverage rule |
| `services/api/src/assistant/*.test.ts` | registry, discovery, requirements, settlement, scenarios |
| `services/api/drizzle/00NN_ai_assist_request.sql` (+ journal) | table `ai_assist_request` (generated with `pnpm db:generate`, journal `when` increasing) |
| `e2e/suites/85-ai-edit-honesty.mjs` | real browser: the chat's message follows the verified document |

**Changed**
| File | Change |
|---|---|
| `services/api/src/assistant/capabilities/types.ts` and the five capability files | each `Capability` gains `meta` (id, label, description, examples, scopes, requirements, template rules, status) |
| `services/api/src/assistant/understand.ts` | intent kind `help` (+ topic); the model is told the unsupported classes (generated from the registry); every family must have registry meta (test) |
| `services/api/src/assistant/pipeline.ts` | ADMIT stage: flag / plan / template / owner / sources checks before anything runs, with plain refusals; `help` outcome |
| `services/api/src/routes/presentations.ts` | builds `expect` for the answer; ensures slide ids on additions; verifies cut-out output (transparency) before offering it; records the request row and its reservations; new route `POST /:id/ai-assist/:requestId/outcome`; generated capability text replaces the hand-written one |
| `services/api/src/media/cutout-picture.ts` | reports the transparency of the stored output (`transparentShare`) and refuses an output without it |
| `services/api/src/db/schema.ts`, `services/api/src/index.ts` | the table; the settlement sweeper interval |
| `packages/theme/src/index.ts` | exports the assist module |
| `packages/api-client/src/index.ts` | `expect` and `requestId` on the answer; `aiAssistOutcome()` |
| `apps/editor/src/editor/commands.ts` | `applyAssist` rebuilt on `assistSteps` (same behaviour, same signature) |
| `apps/editor/src/components/editor/AiPanel.tsx` | applies through `applyAssistVerified`; message from verified results; saves, then reports the outcome |

### 10.3 Data flow (P0)
`ai-assist` (server): understand, resolve, **admit**, do, validate as today, plus: reserve credits as today, **build expectations** from the final answer against the saved document, write the `ai_assist_request` row (expectations, reservation references, base revision), return the answer with `requestId` and `expect`.
Editor: dry run, one transaction, **evaluate on the live document**, compose the message from verified results, flush the save, `POST .../outcome`.
Server (`outcome` or sweeper): load the saved document, **evaluate again** (plus server-only checks such as the stored picture's alpha), decide refunds by `settlementPlan`, store the verified results, mark settled.

### 10.4 Money policy (explicit)
| Case | Rule |
|---|---|
| Nothing verified (every change failed or was skipped or unchanged) | Refund every reservation of the request (base, `:more`, `:enrich`). |
| At least one change verified | Keep the base edit unit. |
| Second unit (reserved because more than one slide was written) | Kept only if at least two written slides (edits or additions) were verified; otherwise refunded. |
| Partial | No pro-rating of the base unit (it paid for understanding and writing); the message states what was and was not done. |
| External provider cost (a paid provider later, image generation) | Each external operation declares `externalCredits`; it is charged only per VERIFIED operation, never for a failed one. Today every assistant operation declares 0 (own model, free photo libraries); image generation keeps its own confirm-and-charge flow. |
| Undo (putting back the assistant's own change) | Free, as today. |
| Client never reports | The sweeper settles it after 10 minutes against the saved document (a change that was never saved is refunded). |
| Client lies | Ignored for money; mismatches are counted (`client_mismatch`). Residual risk: a client that saves the document without the change, reports, then re-applies it could keep one edit unit free; bounded by the existing rate limit (15 per minute) and visible in the mismatch counter. |

### 10.5 Test plan (P0 acceptance)
Run per layer, all free (no AI, no model): **success** (each of the 18 families on a normal deck); **partial** (3 of 4 pictures, one locked); **failed operation** (a step that throws; independent steps survive); **locked slide**; **missing element** (picture deleted meanwhile; element no longer an image); **unsupported operation** (never "done", registry alternatives named); **plan restriction** (premium template on a plan without it, owner-only rewrite); **template restriction** (Morph slide: picture removal and layout refused with the reason); **undo** and **redo** (one step per request, exact state back and forth); **multi-step** (five changes in one answer, one fails); plus **credits** (idempotent settlement, every row of 10.4, a lying client report, the sweeper) and **discovery** (generated from registry and plan; a capability that is not ready is never listed). Plus the browser suite 85 and the existing suites (83, 84, the assistant suites that need no AI) still pass.


---

## 11. P0 result (built and tested 2026-11-19; P1 NOT started)

### What was built (as planned in section 10, with these deviations)
- Capability metadata lives in `assistant/capabilities/meta.ts` as one record that must cover every family (a new family does not compile until it declares itself), instead of a `meta` field on each capability object: same effect, one place, compile-time exhaustive.
- The shared verifier is in `packages/theme/src/assist/`, and its TYPES (`Expectation`, `AnswerChanges`) are in `packages/validation/src/assist-types.ts` so the API client can name them without depending on the theme package.
- `assistant/answer.ts` (new) assembles an answer's changes and promises in one place for both the route and the scenario tests.
- The cross-package scenario suite lives in `apps/editor/tests/` (own tsconfig `tsconfig.scenarios.json`, part of `pnpm typecheck`) because it imports server code.
- The older quick-action endpoint (`ai-edit`) got the same treatment (it had the same unchecked "Done"): expectations, request record, verified message, settlement.

### Acceptance tests (all run, all pass)
| Layer | Result |
|---|---|
| Shared evaluator and message composer (`packages/theme/src/assist`) | 12 tests; also proves the content comparison holds for every real layout the engine produces |
| Editor transaction (`apps/editor/src/editor/assist-apply.test.ts`) | 10 tests: success multi-step, locked, missing element, a step that throws (independent steps survive), a dependent step, "already so", extra hook in the same transaction, delete/duplicate partial, exact undo and redo |
| Scenario catalogue end to end (`apps/editor/tests/assist-scenarios.test.ts`) | 43 tests: 41 scenarios across success, partial, already, locked, missing, failed, unsupported, plan, template, flag, owner, multi-step, undo, discovery, plus undo/redo of a multi-change request and the rule that a capability is only ready if a scenario covers it |
| Settlement (`services/api/src/assistant/settle.test.ts`) | 18 tests: the money policy row by row, and against the real database: never saved, saved, a lying browser (both directions), partial, concurrent settlement refunds once, the sweeper, stored-picture transparency re-check, external-cost reservation, ownership |
| Route (`services/api/src/assistant/honesty.test.ts`) | 7 tests: the answer carries `expect` and `requestId` and the record is written; refund when not saved; charge kept when saved whatever the browser says; locked slide records nothing; discovery generated and free |
| Real browser (`e2e/suites/85-ai-edit-honesty.mjs`) | 5/5: real editor, faked assistant answer including a false server claim |
| Regression | API 1,417 tests, editor 311, theme package 832, all typechecks, lint 0 errors (3 old warnings); e2e 83 (real model, dialog) and 84 (mock provider) still pass; the production bundle still has none of the development-only code |

### Requirement by requirement
1. **Atomic operations**: one history transaction per request (dry run per step, one `apply`, verification on the committed document); exact undo and redo tested. Independent successes survive a failed step; dependents are reported failed. Server side effects (an already stored cut-out picture, the reservation) are handled by settlement, not rolled back.
2. **Stronger verification**: checks look at the document, never at command results. A cut-out is verified as: the right element of the right slide, still an image, now showing the new picture, and the stored PNG really is see-through (measured when made, refused below 2%, and measured AGAIN from the stored bytes at settlement).
3. **Secure credits**: unique `requestId`, one `ai_assist_request` row, server-side settlement against the saved deck, the browser's report only compared (mismatches counted), idempotent, concurrent-safe, sweeper after 10 minutes, explicit partial and external-cost rules (10.4). Residual risk stated in 10.4.
4. **Capability discovery**: intent `help`; answers generated from the registry, the plan, the flags, the deck and the current slide ("what can you do", "what can you edit on this slide", "what is on my plan"); free.
5. **No false availability**: ready means declared ready AND covered by a scenario (enforced by a test); flags (background removal, image generation), plan (premium designs), owner-only, sources, locked slides and animated-template slides are all respected and named. Background removal stays development-only; production offers no provider (unchanged).
6. **Architecture preserved**: existing `CAPABILITIES`, commands, store, undo, `compileAssist`, ledger and refund helpers reused; `applyAssist` keeps its signature (rebuilt on keyed steps).
7. **Testing**: every class the owner listed is in the catalogue and executed.

### What P0 does NOT prove (stated plainly)
- **No real model was used.** The scenario tests use a PERFECT understanding, so they prove our code (resolve, admit, capabilities, apply, verify, compose, settle), not the model. Whether a real model reliably puts "make the logo smaller" in `unsupported` instead of doing something nearby (rule R4), and whether it routes "what can you do?" to `help`, is not measured. The prompt now tells it which classes are unsupported, and the verifier guarantees that whatever it does is reported truthfully, but a mis-mapped request could still be answered with an honest report of a DIFFERENT action. A small real-model sample is the next check; it needs the owner's approval for the cost.
- The browser suite fakes the assistant's answer; the full chain real model, record, browser, outcome, settlement was covered in pieces (server integration tests with the real database; browser with faked answers), not as one live run.
- `e2e/suites/51-text-bullets` could not run here: this dev environment has `REQUIRE_EMAIL_VERIFICATION=true`, so its fresh sign-ups have no session. Unrelated to this work.
- Slide kinds `morph` and `morph-template` are recognised by layout id; "own-template" decks are not yet a separate kind.
- Not built (by design, later phases): element selection, object editing, shapes, tables, charts, per-object animation, transitions, brand, references and uploads (P1 to P4).


---

## 12. P1 result (built and tested 2026-11-19; P2 NOT started)

### What was built
| Item | How |
|---|---|
| **Selection context** | The panel sends what is selected (`selection: {slideIds, elementIds}`); the deck state carries it; the understanding prompt gets `selected` (what "this" and "it" mean) and `objectsOnCurrentSlide` (counts per type and text role). Ids from the browser are checked against the deck. |
| **Objects (new capability `element`)** | A closed set of operations: move (to an edge, centre, or a nudge), resize (by a factor or to a size), text size, text style (bold, italic, colour, alignment, uppercase), align, delete. The model never writes a number: `planElementChange` (packages/theme/src/assist/element-ops.ts) turns each operation into absolute values (edge margin, kept inside the slide, a text box grows with its text), the editor applies them with its own commands (`setGeometry`, `updateElement`, `setRunFlag`, `deleteElements`), and the check compares the deck with exactly those numbers. An object's operations are planned one after the other and merged ("bigger and to the right"). |
| **Which object** | `resolveElements`: selected, by text role, by type, or all text; several matches for a one-object action (move, resize, align, delete) is ONE free question ("There are 2 pictures on slide 1. Select the one you mean…"); nothing selected and nothing named is one free question. |
| **Brand** | Capability `brand`: the server applies the person's saved default brand kit with the existing `applyBrandToTheme` (colours, fonts, logo, each optional) and it goes out as a normal theme change, verified (new theme part `logo`). No kit: said so. Needs the plan's brand kits. |
| **Own pictures** | `picture` gained `replace`: the person's uploaded picture (by name or "latest") replaces the selected picture (or the only one; several without a selection is said, never guessed). Verified as a replacement and worded as one, never as a cut-out. |
| **Plan, lock, template** | The advanced editor and brand kits are checked before anything runs; a locked slide or locked object is refused per object with the reason; on animated-template slides only the words and the text style may change. |
| **Discovery** | The generated answers now list objects and brand, show available sub-abilities, and show the plan limits ("needs a plan with the advanced editor"). |

### Defects the tests found in my own first version (fixed)
1. **Settlement ignored the new change kind.** The server verified an element change as done but the money policy did not count it, so element edits would never have been judged or refunded. The classification is now an exhaustive record over every expectation kind (a new kind does not compile until it is classified), with a test for every kind.
2. **Two operations on one object conflicted** (planned from the original geometry, the second overwrote the first, so the first could not verify). They are now planned sequentially and merged into one change.
3. **"Already so" changed the document.** Asking for bold on a title that is already bold still wrote `bold` onto its runs (a history entry, a changed file) while the message said nothing needed changing. The planner now emits no change for something already as asked, and says so.
4. Wording: slide numbers were missing for element changes ("on a slide"); a deck-wide change with a locked slide now points at the notes instead of reading as a plain "Done".

### Acceptance (all run, all pass)
| Layer | Result |
|---|---|
| Shared planner, evaluator and wording | 839 theme-package tests (19 new for objects) |
| Scenario catalogue end to end (real pipeline, editor commands, verifier, composer) | 73 tests; P1 added: objects (success, several operations, deck-wide, partial with a locked slide, asks, locked slide, locked object, template, plan, missing between answer and apply, already so, no such object), brand (success, none, plan, logo only), own pictures (named, latest, none, unknown name, locked, two pictures), discovery with plan limits |
| Editor transaction | 12 tests (objects: exact values, one undo step, undo and redo, locked slide kept) |
| Route with the real database | 12 tests (the P1 ones: an element change planned, promised and settled by the saved deck; the question is free and records nothing; a locked slide records nothing; the saved brand applied; a stored upload replaces a picture and is promised as a replacement) |
| Real browser (suite 85) | 7/7: the request carries the real selection; an object edit is worded from the deck and ONE undo restores it; the earlier honesty checks still hold |
| Regression | API 1,423 tests, editor 343, theme 839; typechecks clean; lint 0 errors; suites 84 (10/10) and 83 unaffected; production bundle still has none of the development-only code |

### What P1 does NOT prove
- **Still no real model.** The scenarios assume a perfect understanding. New and unmeasured: whether a real model picks `element` with the right references and operations, asks instead of guessing when nothing is selected, and keeps the unsupported classes in `unsupported`. The prompt gained the object rules and the closed operation list (about 140 more tokens per message); a small real-model sample needs the owner's approval for its cost and is the most valuable next check.
- Not built from the P1 list: the Edit/Design/Create quick-action chips (they should be generated from the registry once more capabilities exist), "own-template" as a separate slide kind, and any new editor feature (distribute, group, layer order, crop, footers stay "not in the editor yet").
- Deck-wide object edits are limited to 60 objects per request.
- Brand logo placement uses the editor's existing brand logic; the logo's appearance on every slide was verified as "the deck's brand logo is the kit's logo", not pixel-checked.
- The object planner knows slide size and an edge margin, not the layout engine's grid: "move to the right" puts the object at a 5% margin, which may overlap other objects (the result is verified as moved, not as pretty).

## 13. "Not proven" pass (2026-11-19): what was tested and fixed

- **Real model, 35 cases** (`services/api/scripts/assistant-eval-honesty.ts`, run with `tsx --env-file=.env`): 35/35 on the last run. One case ("use my coffee photo", picks the right upload among several) failed once and passed once: model variance, not yet made deterministic.
- **Invented figures bug (found by the real run):** the figure check compared a chart's numbers against a deck that already contained the new slide, so invented figures traced to themselves; the person's own typed figures were never in the corpus. Now traced against the deck as the person has it + their message + earlier user turns + sources (`compileAssist(..., trace)`), with a regression test.
- **Moves that land on other objects:** `newOverlaps` (element-ops) + a note in the chat ("… now overlaps the body text. Say if you want it moved"). Only overlaps the change creates; backdrops ignored.
- **Chat race (real UI bug):** saved history replaced the on-screen chat when it arrived, so a turn sent meanwhile vanished. Input is now disabled until history has loaded.
- **Credit reclaim:** `reclaimRefunded` (settle.ts, run by the 5-min sweeper): a request refunded because nothing was saved is charged again, once, if the same change is saved within 30 min and EVERY change is verified. Partial results and late arrivals are never charged. Status `reclaimed` is final.
- **E2E:** `person()` verifies the account and signs in, so suites work with `REQUIRE_EMAIL_VERIFICATION=true` (`scripts/qa-verify-email.ts`). Suites must run with `E2E_WEB=http://localhost:3100` (default :3000 is another project). Suite 85 flakes were (a) a test race on chat rehydration (fixed), (b) the API restarting under `tsx watch` when source was edited mid-run. Last clean run: 7 of 8 (the 8th: deck creation failed, now reported with the server's answer).
- **Quick-action chips:** `quickActions` (registry.ts) builds them from the capability registry for this person, deck and slide (exhaustive `CHIP_GROUP` map: Edit / Design / Create / Animations); `GET /presentations/:id/assistant/chips`; the panel shows them instead of a typed list. Suite 86.
- **Own-template slide kind:** slides built from an uploaded file carry `fromFile: true` (validation schema, set in `buildDeck`); `SlideKind` has `own-template`; layout is refused on them with the reason ("built from your own template"), words can still change. Existing decks made before this change have no marker (they are treated as ordinary manual slides).
- **Live full chain (suite 87, real Gemini, a few calls):** real change (dark theme) → chat "Done", deck dark, request settled with nothing refunded, credits spent; unsupported request → nothing changed, credits unchanged. It first FAILED: the dev DB had never received migration 0047 (`ai_assist_request` missing), so every call reserved, failed and refunded. Fixed by `pnpm db:migrate`. A fresh-DB deploy must run migrations before the API serves (already in the release checklist).
- **Suite 51:** 6/6 on a verified account.
- **Final regression:** api 1442, theme 840, api-client 18, editor 343 tests pass; suites 85 (7/7), 86, 87, 51 pass.
- **Known soft spots:** "use my coffee photo" (model picks among uploads) is not deterministic; the concurrent-sign-ups security test failed once under full load and passes alone; decks created before `fromFile` are not recognised as own-template.


## 14. P2, first slice: shapes (built and tested 2026-11-19)

**Built (inside the existing element structure, no new family):** two closed operations on the `element` capability.
- `add_shape` (rectangle, circle, line, triangle, ring, arrow): a size NAME and a place NAME (or "around" the objects named, placed behind them), a theme colour word or hex. Every number is worked out by `planShapeAdd` (packages/theme/src/assist/element-ops.ts); the new shape gets a pre-assigned id so the check can look for exactly it.
- `shape_style`: fill, outline, outline width, rounded corners, see-through (see-through works on any object; the rest only on shapes: "a picture is not a shape" otherwise).
- One rule for "does this operation need objects found first": `needsObjects` (resolve.ts), used by the pipeline and the capability. (A first version asked "which object?" before adding a shape: caught by the scenarios.)
- Verification: `evaluate` looks for the shape by id, kind, place, size and fill on the live deck (editor) and the saved deck (server settlement); a missing shape is a failed check, never "Done". Claims: "Added a rectangle on slide 2", "Restyled the shape on slide 2".
- Refused with reasons: locked slide, animated-template slide, wrong object type, already like that.
- Tests: 8 new scenarios (81 total, through the real pipeline, editor commands, verifier and composer), 5 planner/evaluate unit tests, real model 38/38 (suite `assistant-eval-honesty.ts`), live browser suite 87 with a real circle on the saved deck.
- The "not yet" list now says: tables, charts and icons (not shapes).

**Not built in P2 (said plainly to the user as "not yet"):** editing an existing table's cells/rows, chart type/colour/trend line changes, icons, distribute/group/layer order (the editor itself lacks them), picture crop/filters, references to other slides (copy design/chart/image), notes beyond the text family. Each needs its own typed operation and checks, in the same way as shapes.


## 15. P2, second slice: tables and charts (built and tested 2026-11-19)

**Rule for data:** every operation only MOVES, REMOVES or ADDS EMPTY CELLS of the deck's own data. No operation takes a figure or cell text from a model, so nothing can be invented (the figure-traceability rule for NEW chart/table slides is unchanged).

**Operations (closed, on the `element` capability; the new values are planned by code into the change patch, applied by the editor's own update path, verified by `evaluate`):**
- Chart: `chart_type` (bar, line, pie, doughnut; pie/doughnut refused when the chart has several series, with the reason), `chart_order` (high to low, low to high, A to Z: labels and EVERY series move together).
- Table: `table_order` (a column NAMED by its header, or numbered; numeric columns sort as numbers, "$2,340" above "$1,875"), `table_rows` and `table_columns` (add = empty cells; remove by position; never below 1 row/column; limits 20 rows, 8 columns, said when hit), `table_style` (header, row, border and text colours).
- A column the model names is found by CODE (`columnIndex`: exact name, or one unique part; ambiguous or unknown is a refusal that lists the real columns), after the real model counted columns wrongly in one of three runs.

**Bugs the checks caught:** (1) the editor dropped a height-only change, so "add a row" did not grow the table and the claim was refused (apply now handles a size alone); (2) the eval fixture's own prices made a "refuse invented prices" case legitimately traceable (fixture changed); (3) "use my coffee photo": when the model gives no usable upload name, the person's own words now pick the upload they named before falling back to the newest.

**Prompt budget:** the always-sent understanding prompt grew past its 3000-token guard; the element guide was rewritten more compactly instead of raising the limit again.

**Tests:** 12 new scenarios (92 total), 6 planner tests, real model 42 to 43 of 43 over three runs (misses: coffee photo before the fix, "bring the picture to the front" once asked which picture instead of saying it is not supported, one upload pick); live browser suite 87: a real "sort the table by price" re-orders the SAVED table, nothing invented, request settled as kept. Final regression: api 1443, theme 851, editor 363, api-client 18; suites 85, 86, 87 pass.

**Still not built (said plainly to the user):** changing individual cell text or chart figures from chat, converting a table to a chart (or back), trend lines, chart colours and legends, icons, group/distribute/layer order, picture crop/filters, copying design/chart/image from another slide.


## 16. P3, first slice: slide transitions (built and tested 2026-11-20)

**A new family `transition`** (slide-level, so not an object operation), added along the same path as `lock_slide`, end to end:
- Values (closed, written by the model): type (none, fade, slide, zoom, push, wipe, morph), direction (push/wipe only), speed WORD (fast 300 ms, normal 500, slow 1000: the model never writes a duration), autoAdvanceSeconds. Planned by `capabilities/transitions.ts`.
- Rules in code, each with a reason in the chat: Morph needs Gold or Premium (`features.morph`); Morph cannot be on slide 1; locked slides are left alone; animated-template slides (`morph`, `morph-template`) are refused (their transitions are part of the design); a direction on a type that has none is dropped with a note; a slide that already arrives like that is reported as "already" and not counted as a change.
- Verification: `Expectation` kind `transition` (what the slide must arrive with: the type and each option asked for), `transitionMatches` shared by the editor's live check and the server's saved-deck settlement; claims "Set how slides 2 and 3 arrive: fade"; settlement class `change`.
- Editor: applied with the editor's own `setTransition` (marks it `own`, so a later theme swap keeps it), one undo step with the rest of the request; the assistant's own Undo now restores transitions exactly (including "had none of its own").
- "Animate every slide" stays the deck-motion family (checked against the real model); "fade between slides" is a transition.

**Tests:** 11 new scenarios (103 total; success, partial, plan, template, already, undo), 2 editor tests (apply+undo exactness, locked slide), real model 45 to 46 of 46 over three runs (the misses: one provider error "all models failed", one "bring the picture to the front" answered with a question instead of "not supported yet"), live browser suite 87: a real "add a zoom transition between all the slides" leaves every SAVED slide on zoom, request settled as kept, credits spent. One run of the unsupported-request check timed out once (not diagnosed; the rerun passed).

**Findings:** (1) the template deck already has fade on every slide, so "add a fade" is correctly reported as already so (the eval now uses zoom); (2) compacting the object guide had dropped the wording for "every slide", so "make all the titles size 40" only changed one slide until it was restored: prompt wording is a real dependency of correctness; (3) the always-sent understanding prompt is now about 3100 tokens; the guard was raised to 3500 deliberately (every family adds guide text to every message; raise it per family, on purpose).

**Not built (said plainly as "not yet"):** per-object animations (entrance, emphasis, exit, paths: `effect` system exists in the editor), reading uploaded spreadsheets/PowerPoints/images as references, brand from a website, the rest of P2, all of P4.


## 17. P3, second slice: object animations (built and tested 2026-11-20)

**Correction to the plan table:** normal object animation is on EVERY plan (only Morph is Gold/Premium: `features.morph`); the plan table's "Gold and Premium only" for per-object animation was wrong.

**Two closed operations on the `element` capability** (same structure as shapes and tables):
- `animate`: an entrance, emphasis or exit effect from the editor's own catalogue (fade-in, fly-in, zoom-in, float-in, wipe-in, rise-up, bounce-in, pop-in, appear, pulse, grow-shrink, spin, shake, bounce, blink, fade-out, fly-out, zoom-out, wipe-out, disappear), with the options asked for: start (on click, with, after previous), speed WORD (fast 300 ms, normal 600, slow 1200: no number from a model), direction (left/right/up/down), and "by paragraph / word / letter" for text.
- `animate_clear`: takes all animations off an object.
- Planned by `assistant/effects-plan.ts` from the SAME catalogue the editor and the PowerPoint export read (`@prompttoppt/ui/motion-core`, DOM-free): an effect an object cannot play (a colour change on a picture) is refused with what it does work on; an option the effect does not have (a direction on a fade, by-paragraph on a picture) is dropped WITH a note, never passed on. Locked slides/objects and animated-template slides are refused with the reason. An entrance and then an exit on one object are two separate changes.
- Applied with the editor's own `applyEffect` (replaces an effect of the same kind), `updateEffect` and `clearEffects`, in the request's single undo step.
- Verification: `effectAlready`/`evaluate` look at the slide's own effect list: the effect (and each option asked for) is on THAT object, or no animation is left on it; "already" is reported, not counted as a change.

**Tests:** 11 scenarios (114 total), 3 unit tests, real model 47 to 50 of 50 over five runs on the final code (the animation cases passed every time; misses: "make all the titles size 40" when the model omits the all-slides target, one "move the picture" asked which object, one provider error, one motion-path request answered with a question that offered an alternative instead of "not yet"), live browser suite 87 (7 of 7): a real "make the title fly in from the left" leaves a fly-in from the left on the SAVED slide's title, settled as kept, credits spent.

**Not built (said plainly):** motion paths, triggers (animate on click of another object), reordering the sequence, exact timing/delay/easing, repeat and loop.


## 18. P3, third slice: brand from a website, and what can be read (built and tested 2026-11-20)

**Brand from a website, in chat** ("match the brand of acme.com"): the existing `brand` family gets a `site` value. The site is read by the SAME safe reader the Brand tab uses (`findBrand`: SSRF-blocked, size-limited, no model, no credits), through `assistant/site-brand.ts` (every failure becomes a sentence; 10 lookups an hour per person, kept apart from the Brand tab's allowance).
- Only what was found is applied: colours when the page has brand colours (a second colour made from the first is said), fonts when it names fonts (a font we do not have is replaced by the closest one, and that is said; a site naming only one font keeps the deck's other), a logo only if a usable PNG/JPEG was found. A site with nothing found changes nothing and keeps no credits. Low confidence ("few brand signals", often script-drawn sites) is said.
- **The address must be the person's own:** the real model once filled in "acme.com" for "my company website". Code now refuses unless the address is written in the person's message (`addressIsInMessage`: whole address, not the end of another one), so nothing is read on a guess.
- Plan: same gate as "use my brand" (a plan with brand kits). The Brand tab's website card is gated differently (any paid plan), so Pro users can use the tab but not the chat for this; unchanged on purpose, stated here.
- The website part is never a ready-made chip (it needs the person's own address).

**Readable files, discovery:** "what can you do?" now lists what can be attached as a source and what is read from it, generated from the upload routes' own limits (`sources/readable.ts`), so it cannot drift from what is parsed.

**Tests:** 7 scenarios (122 total), 4 + 1 + 2 unit tests, real model brand cases 6 of 6 three times (named site read; "my company website" never reads; "use my brand" stays the saved brand), the real reader on public sites (stripe.com: colours, fonts, logo, high confidence; example.com: nothing found; private and unknown addresses refused), live browser suite 87 (9 of 9): a real "match the brand of stripe.com" leaves the SAVED deck with the site's colours and logo, settled as kept; "match the brand of example.com" changes nothing, says what it could not find, credits kept back. Suite 87's reply detection was fixed (a reply that quotes the request made "text after the last occurrence" empty).

**Known, not fixed:** a pasted full link (https://…) also makes the route read that page as a TEXT source and charge one extra unit, even when the request is only about brand; the in-chat website reads are limited per process (the dev limiter is in memory, like the others). **Not built:** reading a spreadsheet, PowerPoint or picture AS A DESIGN reference ("use the chart from this file"), brand from a logo file, references to other slides (rest of P2).


## 19. P4, first slice: the deck review (built and tested 2026-11-20)

**A new intent kind `review`** ("review my deck", "what is wrong with my slides?", "find slides with too much text"): the answer is a REPORT built by code (`packages/theme/src/assist/review.ts`), not by a model, with no credits and no change to the deck. Asking to FIX something stays an edit (checked with the real model: "shorten every slide that has too much text" is an edit, not a report).
- Checks (the single list `REVIEW_CHECKS`, read by the report and by "what can you do?"): too much text (over 80 words, with the count), text that does not fit its box, very small text, no title, the same title as another slide, an empty slide, text that is hard to read on its background, the same layout three times in a row, a missing or stretched picture. The overflow/contrast/size/layout facts come from the SAME validators the editor uses; the rest are counted from the document. Focus: all, text, design.
- The report says what was checked, lists findings with slide numbers, says "nothing was changed; this is advice", offers real commands for the first slide of each finding ("shorten slide 3", "fix the text on slide 5 that is hard to read", "delete slide 7"), lists what had no findings, and always says what it did NOT look at: whether the facts are right, how the story flows, wording and tone.
- Not judged on purpose: inconsistent font sizes (the layout engine fits text per slide, so sizes legitimately differ), notes, tone.
- A "Review my deck" chip is offered first, counted inside its group's cap.

**Tests:** 7 unit tests (each finding, clean deck, focus filtering, command suggestions and the "and N more" cut), 3 scenarios (125 total), real model 56 to 57 of 58 per run over three runs (review requests routed to the report; one run sent "what is wrong with my slides?" to the help answer, which is model variance; the rest are the usual provider error), live browser suite 87 (10 of 10): a real "review my deck" returns the report, the saved deck is byte-identical afterwards, no credits kept, no change record. Final regression: api 1450, theme 861, editor 397, api-client 18; suites 85, 86, 87 pass (85 and 86 alone: they time out under unit-test load).

**Not built (said plainly):** reorder by flow, merge two slides, split one, group related slides or add sections, "keep the best 5", shorten or expand the whole deck to N slides, "improve the story", check facts. These need either a model's judgement (so a confirmation step and an honest "I changed X, kept Y" report, requirement R9) or new editor commands.


## 20. P4, second slice: confirm-then-do restructuring (built and tested 2026-11-20)

**The confirmation step (requirement R9).** Deck-level changes are judgements about the whole deck, so NOTHING happens on the first message: the assistant shows exactly what it would do and the person confirms with a button.
- New family `restructure` (`capabilities/restructure.ts`; the model only chooses the action): delete the **empty** slides, delete **duplicate** slides (a later slide saying exactly the same words as an earlier one; the first stays), **reduce** the deck to N slides, **reorder** for a better flow. Empty and duplicate slides are found by CODE with no model; reduce and reorder use one cheap model call that proposes slide NUMBERS only.
- Every proposal is checked by code before it is shown (`checkReduce`, `checkOrder` in `packages/theme/src/assist/restructure.ts`): exactly the asked-for count is left, slide 1 stays, no repeats, no locked slide removed, every slide listed once, locked slides keep their place, and a "new" order must really differ. A wrong answer gets ONE more try with the exact reason, then the person is told nothing was changed.
- The confirm button sends a structured plan (`confirm`: delete these slide ids / use this order) back with the next request. It is checked against the deck AS IT IS THEN (`planRestructure`): a slide that is gone, a locked slide, a list that would empty the deck, an order that is not exactly this deck's slides (the deck changed since), or one that would move a locked slide, is skipped or refused with the reason. **A model cannot confirm anything:** the confirmed plan reaches the capability only from the request (`RunCtx.confirm`), never through the model's values, and a confirmed request does not call the model at all.
- Execution reuses the existing verified changes: deletions and one placement per slide (each checked in the saved deck), one undo step, charged like any single change; the plan request itself changes nothing and is refunded.
- Chat wording is generated by code ("To bring the deck from 11 to 8 slides I would delete these 3 slides… Delete these slides?"); the options are the confirm button and "No, leave the deck as it is".

**Found while testing live (a real gap, fixed):** past a daily allowance of 25 free "planning" refunds per account (an abuse guard that already existed), a reply that changes nothing is charged, and it was charged **silently**. The reply now says so ("You have used today's 25 free checks and answers, so this reply used 2 credits") and reports the charge (`creditsCharged`). Route test covers the 26th check.

**Tests:** 7 + 7 unit tests of the rules, 15 scenarios (140 total: confirm delete, partly locked, stale, delete-all refused, confirm reorder, locked reorder refused, stale reorder, proposals for empty/duplicates/reduce/reorder, wrong model answers, missing target), route test for the charge rule, real model 62 to 64 of 64 over three runs on the final code (all six restructure cases passed every time; every miss was a provider error), live browser suite 87 (11 of 11): a real "reduce the deck to 2 slides" shows the plan first (deck unchanged, no credits kept, no record), the button then deletes, the SAVED deck has 2 slides, the request is settled as kept. One earlier run: a real "review my deck" was rejected once with a 422 (not reproduced in 8 further runs; unexplained).

**Not built (said plainly):** merge two slides, split one, group related slides into sections, "keep the best 5" by merit beyond the reduce plan, improving the story, shortening each slide to fit fewer slides. The plan/confirm machinery is general (`Restructure` can grow), but each of these rewrites words and needs its own honest "changed X, kept Y" report.


## 21. Remaining-features pass, batch 1 and 2 (built and tested 2026-11-20)

**Honesty gaps closed**
- **Chat Undo covers object changes.** `snapshotAssist` now records, per slide the change touched (and that was not rebuilt from its words, restyled, or part of a design change), the slide's whole object list and animations as they were; `revertAssist` puts them back. A new shape, a re-sized picture, a sorted table and an animation are all restored exactly (unit test), and a locked slide is not touched. A design change keeps using the design undo.
- **Confirmation thresholds for direct destructive commands (decision 3 of section 8, using the numbers the document proposed).** The same confirm step now guards: deleting **3 or more** slides in one message (`DELETE_CONFIRM_AT`; one or two are done directly as asked), **replacing every picture**, and **rebuilding the whole deck** (a rewrite used to start the moment the model chose it). The confirmed payload is general (`remove`, `reorder`, `refresh_pictures`, `rewrite`) and the pipeline routes a confirmation to the capability that owns it; a model still cannot confirm anything.

**P2 data features**
- **One table cell or one chart figure** (`table_cell`, `chart_value`): the new text or number must be the person's own. Any number in it that is not in their message, the deck or the sources is refused ("I did not set that: the figure 99 is not in your message, your deck or your sources, and I never make up numbers"). Rows and columns are named (the first cell of the row, the column title) and found by code; an unknown name lists the real ones; a header rename needs no row. Chart figures: the item and series are found by name; several series without a name is a question.
- **A chart made from a table** (`chart_from_table`): labels from the first column, one series per column whose cells are ALL numbers (currency and % read; a mixed unit is dropped), text columns skipped, pie takes one series. Placed in free room beside or below the table; with no room, or no numbers, it is refused with the reason. Verified by the new chart's id, labels and figures.
- **Copy an object from another slide** (`copy_object`: "copy the chart from slide 6 to slide 2"): the object is found on the SOURCE slide (ambiguity is a question), copied onto each open destination slide; locked, animated-template and same-slide destinations are refused. Verified by an object of the same kind with the same content.

**Findings from the real model and the live run (all fixed)**
- The model does not see table contents, so a row NUMBER is a guess: after a sort, "set the price of Basic" changed Pro. Rows are now named. (Found by the live suite, not the unit tests.)
- A header rename had no row and my schema demanded one, so every try was rejected; found from the usage log.
- "Review my deck" was twice sent to the restructure family and rejected (422). The usage log gave the cause; the guide now says checking is never restructure, and the validation message itself tells the model what to do (the gateway feeds it back in its repair pass). Making a field optional had REMOVED that safety net (an empty value then passed silently), so required fields stay required.
- "Make this slide look better" can now end in the confirm question about replacing all pictures (nothing changes unconfirmed).
- The always-sent prompt guard is 4000 tokens (the guide is the static, cacheable part).

**Tests:** 160 scenarios (13 new for these features, plus the confirm flows for pictures and rebuilds), 6 + 4 planner tests, real model on every new case, live browser suite 87 (13 of 13 on a fresh account): a real cell edit leaves exactly one saved cell changed, a real copy puts the table on slide 3 with the same rows, plus everything before. **Not verified live:** chart-from-table (scenarios and unit tests only: the live deck has no room for it).

**Still not built:** icons; chart colours, legend, trend line; picture rounding, crop, filters (the editor lacks crop and filters); speaker-notes depth (counts, timing, Q&A) beyond the text family; motion paths, triggers, exact animation timing; using an uploaded file as a design reference; brand from a logo file; merge, split and sections; improving the story; a deck-wide consistency sweep; fact-checking.


## 22. Remaining-features pass, batch 3: merge, split, notes, honest refusals (built and tested 2026-11-20)

**Merge and split slides** (family `combine`, `capabilities/writing.ts`): "merge slides 3 and 4" (2 to 4 slides into one) and "split slide 5 into two" (2 or 3 parts). A writer sees only the selected slides and may use only their words and facts. Code then:
- refuses unless EVERY slide involved is open (not locked, not hand-edited, not an animated-template slide) and says why: nothing is merged half-way;
- checks the layout (the first slide's own, or title-body) and that the result does not ADD words (a merge may not exceed the originals' words; a split may add only a short title per part), with one retry that names the exact reason;
- traces every figure to the person's words, the deck and the sources BEFORE returning anything, so a result that would be refused later can never leave the other slides already deleted;
- builds the report from the REAL content, not the writer's word: "These figures from the original slides are not in the result: 42" (only figures worth noticing: two or more digits, decimals, percentages; step numbers are ignored) and "The result has N points (the original slides had M)".
A merge keeps the first slide's place and deletes the others; a split keeps the first part in place and adds the rest right after. Priced as what is written (a merge is one written slide however many it takes in; a split its parts); settlement refunds the second unit when only one slide was written.

**Speaker notes** are reported as notes ("Wrote the speaker notes of slide 2"), not as "Rewrote the text", when only the notes changed (`edit` expectation `change: 'notes'`).

**"I can't do that yet" is never a mistake.** Found live: the model once put "sort the table" under unsupported (an honest-looking but FALSE refusal). Now, when the model returns only unsupported parts and no task, it gets one second look at the code-generated list of what CAN be done for this person now, and keeps "unsupported" only if nothing fits. Checked with the real model that all six genuinely unsupported requests (video, slide numbers, group, layer order, crop, motion path) stay unsupported.

**Real-model findings, all fixed:** the model writes `brief:` or `count:` instead of `action`/`target` unless the guide shows an example (an example for EVERY action: one example alone anchored it on that action); a missing required value is repaired by the gateway's retry only if the schema FAILS, so required stays required and the error message says what to do; "the heading" means the title (the guide now says so).

**Tests:** 11 merge/split scenarios, notes unit test, figure-filter unit tests, 3 second-look pipeline tests, real model: merge, split, notes and the table cases pass; the full sweep 71 to 73 of 74 (misses: "shorten every slide that has too much text" is answered with a review about one time in three; the rest were fixed afterwards), live browser suites 87 (13 of 13) and the new 88 (2 of 2: a real merge leaves one slide in place of two in the SAVED deck, settled as kept; a hand-edited slide is refused, nothing deleted, credits kept back). Final regression: api 1455, theme 874, editor 442, api-client 18.

**Not verified live:** split (scenarios, unit tests and real-model intent only), chart-from-table, notes. **Not built:** icons (the editor's icons are emoji stickers from a fixed list; the project rule is no emoji, so this needs your decision), chart colours/legend/trend line, picture rounding/crop/filters, motion paths/triggers/timing, using an uploaded file as a design reference, brand from a logo file, grouping slides into sections, improving the story, a deck-wide consistency sweep, fact-checking.


## 23. Flows, batch 4: review → fix, and sections (built and tested 2026-11-20)

Built and verified as whole flows, first message to saved deck.

**Flow: review → fix** (family `repair`, `capabilities/repair.ts`). After "review my deck", "fix the problems you found" / "clean up my deck":
- The slides to touch come from the SAME findings the review lists (no model decides what is wrong). Hard-to-read text is repaired by the readability fix (no words change); slides with too much text, text that does not fit or very small text are shortened by the existing text writer (every figure kept, nothing added; at most 10 slides per request, the rest said).
- Anything that needs a decision (an empty slide, a missing or repeated title, a repeated layout, a missing picture) is NOT guessed at: it is listed with the exact thing to say ("Not fixed (it needs your decision): nothing on the slide on slide 4. For example say "delete slide 4"").
- Locked and hand-edited slides are named and left alone; an honest note is never replaced by "nothing to fix" (a bug found in testing).
- Found in testing: the review itself gave a FALSE finding ("no title on slide 2" on a big-number slide, which has no title by design). A slide is now flagged only when its own content has an empty title field.

**Flow: sections** (restructure action `sections`). "Group the slides into sections": the model proposes 2 to 6 section titles and where each starts (numbers only); code checks them (from slide 2, later and later, different short titles, a deck of at least 4 slides); the plan is shown ("I would add 3 section divider slides, each right before the slide shown: before slide 2 — new section …"); the confirm button sends the plan (`kind: 'sections'`, slide ids) which is checked against the deck again (a vanished slide, a divider before the first slide, repeated starts or titles are refused with the reason) before divider slides are added right before the chosen slides. Your slides are not touched; verified as new slides in the saved deck.

**Tests:** 5 + 3 scenarios for repair and 5 for sections (179 total), unit tests for the section rules and the title finding, real model: repair vs review routing 6 of 6 each, sections 6 of 6; live browser suite 89 (2 of 2): sections (plan first with the deck unchanged and nothing charged, the button adds dividers, the SAVED deck has them, settled as kept) and review → fix (the report finds the hard-to-read and the empty slide; fix repairs the saved text colour, lists the empty slide, does not delete it). Suites 87 (13 of 13), 88 (2 of 2), 85, 86 pass. The live suites' reply detection now waits for the message box to be usable again with something after the message (a model's own sentence is a valid reply). Final regression: api 1455, theme 878, editor 453, api-client 18.

**Not verified live:** the shortening half of repair (the live deck's slides are hand-edited, which the writer refuses by design; covered by scenarios and the real-model routing). **Not built:** icons (decision needed), chart colours/legend/trend line, picture rounding/crop/filters, motion paths/triggers/timing, a file as a design reference, brand from a logo file, improving the story, fact-checking.


## 24. Batch 5: exact animation timing, motion paths, picture shapes (built and tested 2026-11-20)

**Exact animation timing** (`animate` operation, `effects-plan.ts`): `seconds` (how long it lasts), `delay` (wait before it starts), `repeat`, `loop` (until the slide ends; wins over a repeat count), `distance` as a name (small 150, medium 300, large 600). Seconds become milliseconds, clamped to what the editor allows (0.1 to 20 s); an option the effect does not have is dropped with a note. Verified on the saved effect (`effectAlready` compares delay, repeat, loop and distance as well as type, start, duration, direction).
- The real model first read "after 2 seconds" as "start after the previous animation, lasting 2 seconds" (it passed `start: after` and `seconds: 2`). The guide now separates the three meanings (wait / lasts / after the previous one); 3 of 3 correct afterwards, and the live suite checks the SAVED effect has `delay: 2000` and the default length.

**Motion paths:** `path-line`, `path-arc`, `path-turn`, `path-circle` presets, with a direction and a named distance. The editor draws the points with its own `setPathShape` (setting only `direction` and `distance` on the effect would have left the old points). A hand-drawn path says "needs the editor".

**Picture shapes** (`picture_style` operation): the crop shape (none, circle, arch, diagonal, diagonal-flip, hexagon), corners by name (square, small 16, medium 40, large 90 px) and how the picture fills its frame (cover, contain). "Rounded corners on a picture that already has a cut shape" is refused with the reason; a non-picture is refused; "already like that" is reported. Deck-wide ("make all the pictures circles") works through the existing object references.

**Tests:** 10 scenarios (189 total), 4 planner unit tests, real model: delay, path, circle and rounded-corner cases pass; live browser suite 87 (14 of 14 on a fresh account) with the saved-delay check; suites 85, 86, 88, 89 pass. Final regression: api 1459, theme 878, editor 463, api-client 18.

**Recommendation, NOT done (do this before the next capability):** the always-sent understanding prompt is about 4,100 tokens and its guard has now been raised four times (2,600, 3,000, 3,500, 4,000, 4,500). The object-operations part of the guide is the bulk of it. Split it: a short routing guide for every message (families, kinds, rules), and a second focused call carrying the full operation list only when the model chooses the object family. It would cut the cost and the confusion on every non-object message (the model's mistakes have grown with the guide: false "I can't", wrong family) at the price of one extra cheap call on object edits. The scenario and eval suites are the safety net for that refactor.

**Not built:** icons (decision needed), chart colours/legend/trend line (the document model has no such fields), picture crop to a custom rectangle and filters (the editor has none), triggers (play when another object is clicked), a file as a design reference, brand from a logo file, improving the story, fact-checking.


## 25. Owner decisions and the section 3 pass (built and tested 2026-11-20)

**Decisions taken:** emoji "stickers" removed from the editor (use a picture or a shape). Video is not supported, and the assistant says so. Chart legend, trend line and single-series colours are NOT in the document model, so the assistant says they are not supported and a person can only change the chart's data, type and unit in the chart panel (the chart takes its colours from the deck). Hand-drawn motion paths DO work in the editor's Animation pane; the assistant can only add a line, arc, turn or circle path. Confirmation thresholds are the ones in section 4.3.

**One list of what cannot be done:** `services/api/src/assistant/not-supported.ts` (NEVER and NOT_YET). Rule 10 of the understanding prompt, the second step's prompt and the "what can you do?" answer are all generated from it, so they cannot disagree. Remove an entry from NOT_YET in the same change that builds the feature.

**Pictures (zoom, position, light, shadow):** new picture fields `zoom`, `focus`, `filter` (brightness, contrast, black and white) and `shadow`, shared helpers in `packages/validation/src/picture.ts`. The canvas draws them with CSS; the PowerPoint export BAKES them (and the cut shapes and rounded corners) into a PNG with sharp (`export/picture-bake.ts`), because PowerPoint can only show a rectangle or an ellipse. An export bug found on the way: sharp refuses a 4-band `linear` on a 3-band picture, which threw inside the bake and silently fell back to the plain picture; each step now works on a materialised RGBA buffer and `pptx-picture.test.ts` proves a baked picture is in the file. Editor: a "Picture" panel in the format bar (sliders for zoom, left/right, up/down, brightness, contrast, black and white, a shadow choice, reset). Assistant: `picture_style` takes `zoom` (in, out, reset or a number), `view` (left, right, up, down, center), `brightness`, `contrast`, `blackAndWhite`, `shadow`, `resetLook`; the words become numbers in code (`pictureLook` in element-ops.ts), and `alreadyAsked` knows the new fields. "Crop" means zoom and position (there is no free rectangle crop).

**Confirm first (new):** removing the pictures of 3 or more slides (`clear_pictures`) and turning off the animation of the whole deck (`clear_animations`), on top of delete 3+, replace all pictures, rebuild. Same machinery: a payload sent back with the next request, checked again, never from the model.

**Upgrade offer:** a refusal caused by the plan (advanced editor, brand kit) now carries `upgrade` and the panel shows a "See plans" button that opens the existing upgrade dialog. A switch that is off or a rule is not an upgrade.

**Step by step:** a message with more than 4 different tasks does the first 4, names the rest in the person's own words (`phrase` on each task, from the model) and offers a "Do the next step" button (`continueWith`). The schema allows 14 tasks, so a long message no longer ends in an error.

**Animation:** `easing` by name (smooth, slow-start, slow-end, steady, bounce → the editor's own curves) and `animate_order` (first, last, earlier, later): the place is worked out from the slide's own effect list and applied with the editor's `moveEffect`; checked on the slide. Triggers are NOT built.

**Consistency:** `font_size` with `same: true` gives all matched text the most common size among them (the larger on a tie), chosen in code, and says which size.

**Logo:** the company logo can sit left, centre or right along the bottom (`brand.logo.align`, drawn by the layout engine, re-drawn on composed and hand-edited slides, checked as part of the theme). It refuses a place that would sit on top of the slide numbers or the deck title.

**Story advice:** `review: "story"` returns a labelled opinion (flow, what works, what may be missing, what to change) read from titles and first lines only, built by code around the model's lists; the model is told to name the KIND of missing information and never to supply it; nothing is changed.

**Real-model lessons:** a field the model must fill must appear in the reply-format line, with an example for every value; a required field with a good error message was NOT enough (it failed twice and "review my deck" broke), so a review focus with no tasks is treated as a review in code. A task the model also lists as "unsupported" is not removed by a rule in the prompt (still seen for "curved path": the path is added AND a false "I can't do that yet" note appears: known issue, below).

**Not built (still open):** brand from an uploaded logo FILE, "use slide N / this file as the design", animation triggers, grouping, free-rectangle crop, per-slide logo placement, a consistency sweep beyond sizes (colours, spacing).
**Known issues, fixed the same day (§26 below):** the false "I can't do that yet" beside a done motion path, the page-read charge for a link that was not needed, and the missing live run of chart-from-table, split and shorten.


## 26. Known issues fixed (2026-11-20)

- **False "I can't do that yet" beside a done path:** the first understanding step was told about object-level gaps (hand-drawn path, grouping, triggers, shape shadow, chart legend) and flagged requests it was already doing. Those entries now carry `objects: true` in `not-supported.ts`; the first step is told only the deck-level list and that an object request goes to the `element` family, and the second step (full operation list, one task to refuse) is the one that says "not available". Real model: path, circle, grouping and text shadow all correct, no false note.
- **Linked page charge:** reading a pasted link is now its own reservation (`:pages`, one unit per page), kept only when the page's words reached a writing call (`<source` in the prompt) and the answer changed the deck; otherwise it is refunded and the answer says "I did not need the page you linked, so reading it was not charged". Settlement treats a kept page charge like the enrich charge. Route tests: used = 4 credits, unused = 2 credits plus the note.
- **Live runs found three real faults** (new suite `e2e/suites/90-ai-live-flows.mjs`, seeded by `scripts/qa-seed-flows.ts`, run on a fresh Gold account, judged on the SAVED deck):
  1. "turn the table into a chart" was refused with "no free room" for a full-width table. The planner now makes the table half as wide and puts the chart beside it, says so, and both changes are verified (`also` on `Planned`).
  2. "fix the problems" failed on a long slide because the live model wrote an invalid layout name in the rewritten slide, twice. The text writer never changes a layout, so a layout name that is not a layout at all is now the slide's own before the rest is checked (a real but different layout is still refused). The "couldn't fit" note now also says WHY.
  3. Split passed on the first run.
  Live: suite 90 3 of 3.
- **Still open:** brand from a logo file, a file or slide as the design reference, animation triggers, grouping, free-rectangle crop, opening an export in real PowerPoint.


## 27. Coverage audit: every point of this document against what is built (2026-11-20)

Legend: DONE = built, covered by scenarios or tests, and (where it matters) run with the real model. PARTLY = built with the gap named. OPEN = not built. "Live" = run in a real browser against the saved deck.

### 27.1 The rules (section 2)
| Rule | State | Note |
|---|---|---|
| R1 no claim without evidence | DONE | verifier on the document, message from checks |
| R2 per-item reporting | DONE | partial results, skipped with reasons |
| R3 "not supported" from code | DONE | one list (`not-supported.ts`) feeds the prompts and the help answer |
| R4 never swap in a different action | PARTLY | code refuses what the model flags; the model can still pick a nearby operation. Real-model eval 87 of 91 (the misses were stale cases and variance); no hard guarantee |
| R5 one short question | DONE | |
| R6 preserve everything not asked for (collateral check) | **OPEN** | the verifier checks the asked-for values only; nothing compares the rest of the deck before and after (no collateral check exists in code) |
| R7 never invent data | DONE for figures (traced to message, deck, sources). PARTLY for "add statistics / real-world example": no scenario proves it asks or marks a placeholder |
| R8 one undo step | DONE | |
| R9 confirm before destructive bulk actions | PARTLY | confirm exists for delete 3+, replace all pictures, rebuild, remove pictures from 3+ slides, all animations off, restructure, sections. **Missing: a text rewrite of more than half the deck (for example "shorten every slide") is not confirmed** |
| R10 locks, plans, flags said | DONE | upgrade button for plan limits |
| R11 templates not broken | PARTLY | scenarios cover layout, add shape, transition, picture removal, text on Morph slides. Not covered by a scenario: replacing a template picture on every scene, adding a slide to a template, the warning when a delete/move breaks a Morph sequence, "theme applied through the template palette says what could not change" |
| R12 pay only for verified work | DONE | settlement, sweeper, reclaim |
| R13 truth about cost and time | PARTLY | image generation confirms its cost; **a message that writes many slides does not say the cost and ask** |
| R14 model never writes the result message | DONE | story advice is the one labelled opinion the model writes, inside a code-built frame |

### 27.2 Architecture and tests (sections 3, 10)
- DONE: registry, typed operations, verifier, composer, outcome report, server settlement, scenario catalogue (220 scenarios), second-step object call, chips, discovery.
- **OPEN: the "honesty property" suite (3.7b)**: random sequences of operations on random decks (locks, missing elements, template slides) that must never produce a claim without evidence. Only fixed scenarios exist.
- OPEN: the usage ledger metric `verified_changes` (3.5). The data exists (`ai_assist_request.results`, `mismatches`) but nothing reports claimed-versus-verified per capability.
- OPEN: "per-command results" (3.3) was replaced by verifying the document; the toolbar commands still do not report skips. Not needed for the assistant; noted for completeness.

### 27.3 Scope, references, ambiguity (section 4)
- DONE: scope resolution, selection, ask-once, "just changed", chat references, a reference that matches nothing is asked about.
- **OPEN: "use slide 3's layout / design" and "use slide 4's content" as references (4.2, 6.9).** Copying an object from another slide, merging and splitting exist; copying a slide's design does not.
- PARTLY: "vague taste" requests ("make it look better") act through layout and text; no scenario proves the "say what changed" wording.

### 27.4 Catalogue (section 6), row by row
**6.1 Theme, design, branding**
- DONE: dark/light, palette, background colours and gradients, named fonts from the pair list, font size, bold, italic, colour, alignment, uppercase, saved brand, brand from a website, logo on every slide, logo position (bottom: left, centre, right).
- PARTLY: style words ("glassmorphism", "futuristic"): picks the closest design, but there is no scenario proving it says the named style is not available. "Consistent design everywhere": no sweep beyond font sizes. A font not in our list: the closest is used, not proven to be said.
- OPEN: brand from an uploaded logo file; line spacing; font weight other than bold; "transparent background is refused" (no scenario).

**6.2 Slide management**
- DONE: add, delete, duplicate, move, lock, delete empty or repeated slides, reduce to N, reorder, sections, merge, split, slide numbers.
- PARTLY: "add before slide N", "same layout as slide N" (after and layout names work; no scenario for the copy). "Contact details" on a closing slide (lists what is missing: not proven).
- OPEN: swap two slides (no scenario; it is two moves), expand a deck to N slides.

**6.3 Text** DONE, including notes, tone, translate, grammar. PARTLY: statistics rule (27.1 R7). Story advice and missing information: DONE as a labelled opinion.

**6.4 Images and media**
- DONE: replace from libraries or uploads, replace all (confirm), generate (cost confirm), picture shape, corners, fit, zoom, position, brightness, contrast, black and white, shadow, reset, PowerPoint export of all of it, video refused.
- Blocked by licence (owner): remove background in production.
- OPEN: free-rectangle crop (decided: zoom and position only), "dark version of this image", "same image style everywhere".

**6.5 Shapes, tables, charts**
- DONE: rectangle, circle, line, triangle, ring, chevron, fill, outline, corners, see-through, align, distribute, layer order, table sort/rows/columns/cell/colours, chart type/order/one figure/from table (live-verified), copy an object to another slide.
- OPEN: group and ungroup (the editor lacks it), shape gradient fill, an arrow, duplicate a shape on the same slide from chat, highlight the maximum in a table, number formats, updating a table from a spreadsheet, stacked charts, chart labels, chart colours/legend/trend line (never: not in the model).

**6.6 Position and size** DONE. OPEN: align across slides, margins, symmetry.

**6.7 Animation**
- DONE: per-object effects, exact timing, delay, repeat, loop, distance, direction, by paragraph/word/letter, easing, play order, motion paths (line, arc, turn, circle), remove, deck-wide motion, slide transitions, Morph with plan gate.
- OPEN: triggers (play when another object is clicked), a typewriter effect (not in the catalogue), transitions "per section".

**6.8 Layouts and templates** DONE. PARTLY: template matching the brand.

**6.9 References, links, uploads**
- DONE: link reading, uploads and the readable-files list, copy chart/table/image from another slide.
- OPEN: a slide or a file as the DESIGN reference; "source link in notes" (no scenario); competitor comparison from a URL is whatever the text family writes (no scenario).

**6.10 Presentation-wide**
- DONE: theme, fonts, brand, backgrounds, transitions, motion, rounded images everywhere, slide numbers.
- OPEN: custom footer text, same chart palette (never), same image style, expand to 15, "investor-ready / client-ready" (only the owner-only rebuild exists).
- PARTLY: consistency (sizes only; colours, alignment and spacing are not swept).

**6.11 Notes** PARTLY: notes are written by the text family and reported as notes; counts, timing estimates and Q&A are not scenario-tested.

**6.12 Review** PARTLY: the review is DONE for text length, fit, small text, titles, empty and repeated slides, contrast, layout repeats, pictures. OPEN by design or not built: grammar, inconsistent fonts and colours (deliberately not judged), alignment problems, a one-click fix BUTTON (fixing is a chat message, "fix the problems you found").

**6.13 Multi-step** DONE: four parts at a time, the rest named with a "Do the next step" button.

### 27.5 Decisions (section 8) all taken: architecture, refund, thresholds, plan gates with the upgrade button, remove background (not available in production), order, chips.

### 27.6 Verification that is still missing
- Live browser runs, never done, for: the picture panel and a saved picture look, the "Do the next step" button, the "See plans" button on Starter, the confirm for removing all pictures or all animations, story advice, logo position.
- An exported PowerPoint file opened in real PowerPoint (baked pictures were checked by reading the file).
- Model variance seen in earlier runs and not re-measured: "shorten every slide that has too much text" sometimes answered with a review; "make all the titles size 40" sometimes only changes one slide; "use my coffee photo" among several uploads.
- Known limits: deck-wide object edits cap at 60 objects; "move to the right" is not aware of the layout grid (overlap is reported, not prevented); decks made before `fromFile` are not recognised as own-template; the logo was not pixel-checked.

### 27.7 What to fix next, in this order (items 1 to 5 and most of 6 and 7 were then done: see section 28)
1. **R9 and R13 gap:** confirm (with the cost) before a text rewrite of more than half the deck or many slides. Small, same machinery as the other confirms.
2. **R6 collateral check:** after applying, compare everything outside the asked-for targets; report an unexpected change. This is the largest missing guarantee in the contract.
3. **The honesty property suite (3.7b):** the safety net for 2.
4. **Template scenarios (R11):** the four uncovered rows.
5. **Live runs** for the new flows and the model-variance cases (27.6).
6. **References (4.2):** "use slide N's design"; then brand from a logo file.
7. **Smaller catalogue gaps:** swap slides, expand to N, shape gradient and arrow, duplicate a shape, table highlight and number format, custom footer text, typewriter, `verified_changes` metric.
8. **Needs your decision, not code:** group/ungroup (editor feature), triggers, free crop, chart colours/legend (model change), remove background licence.


## 28. Owner decisions on the open items, and what was built (2026-11-20)

**Decisions:** group/ungroup, triggers and free crop are to be built (not deferred). Chart colours, legend and trend line are to exist in the EDITOR (as in PowerPoint and Google Slides) and the assistant answers "do it yourself in the chart panel". Background removal: use the best hosted provider.

**Background removal:** Photoroom's Remove Background API (about $0.02 a picture; the cheapest found) is the production provider (`media/photoroom.ts`, `bg-providers.ts`, `docs/BACKGROUND_REMOVAL_PROVIDER_DECISION.md`). Offered only when `PHOTOROOM_API_KEY` is set. NOT verified, owner must check before launch: commercial rights to the output under the API terms, the privacy text (the picture is uploaded), production rate limits, our credit price against the cost, and one live call with a `sandbox_` key (no key in this environment, so no real call was made).

**Chart style (editor):** the chart model gained `colors` (per series or slice), `legend` (none, bottom, right), `trendline` and `dataLabels` (`validation/chart-style.ts`, one set of helpers). Drawn by the SVG chart and exported to PowerPoint (native colours and legend; a trend line is a dashed second line series, the PowerPoint way). Edited in the chart dialog's new Style section. The assistant says it cannot, and tells the person where (the refusal carries "select the chart, choose Edit data, use the Style section", from the list in `not-supported.ts`).

**Free crop (editor):** a picture can be cut to any rectangle (`crop`, fractions of the whole picture). The crop dialog has a draggable box, eight handles, arrow-key nudging and shape locks (free, original, 1:1, 4:3, 16:9, 3:4, 9:16); the frame takes the cut-out's shape so nothing is stretched (`crop-geometry.ts`, `setPictureCrop`). Drawn by CSS, baked into the PowerPoint picture. Zoom and position are not used on a cropped picture. The assistant keeps zoom and position, and answers "use the Crop tool" for an exact rectangle (it does not know a picture's pixel shape).

**Group and ungroup (editor and assistant):** objects share a `groupId`. Selecting any member selects the group; the group moves, resizes (its bounding box, text scales), copies (a copy of a group is a new group), deletes and animates as one. Group and Ungroup buttons, Ctrl+G and Ctrl+Shift+G. Assistant: `group` and `ungroup` operations, planned by code (`planGroup`), verified on the document. **Limit, stated:** the PowerPoint file lists grouped objects as separate objects (the export library has no groups).

**Triggers:** were ALREADY built in the editor, the player and the PowerPoint export (an interactive sequence per trigger object); section 24 was wrong to list them as missing. New: the assistant can set one ("make the chart appear when I click the title": `whenClicked`, the clicked object found by code on the same slide, applied with the editor's own `setTrigger`).

**Audit items 1 to 4 (section 27.7):**
1. **Confirm before a big text rewrite:** more than half the deck (and at least four slides) is shown first with its cost ("counts as two edits") and confirmed (`text_bulk`); the review-then-fix flow is exempt, because "fix the problems you found" is the go-ahead for the listed slides.
2. **Collateral check (R6):** `packages/theme/src/assist/collateral.ts`; after an answer is applied, any slide it did not name that changed is reported in the message with the one-step undo. It runs on every scenario (230, none leaked) and has its own negative tests.
3. **Honesty property test (3.7b):** every scenario, six fixed seeds, on decks randomly made worse (locked slides, a missing object, hand-edited slides): no false tick, no "Done" without a change, one undo step, no stray change, a deck untouched when nothing was done.
4. **Template rows (R11):** notes, computed from the deck, for delete or move of a scene ("the Morph between its neighbours may look different"), for a new slide in a template deck ("an ordinary slide, no Morph scene") and for replacing a template picture ("replaced on all N slides that show it", locked ones named). Tested on a real Morph deck. **Not done:** a note for palette changes on a Morph deck (behaviour not verified; on an ordinary template deck a palette change recolours the slides).

**Assistant answers found by the live runs:** an "unsupported" answer is now an id from the list (the model copies a short id, not long wording), the second step must choose from a fixed set of ids plus `other`, and a model-invented operation fails with a message that tells it to refuse instead. The real model still sometimes substitutes a nearby operation for a text shadow (a bold change): variance, known.

**Live suites (real browser, saved deck, fresh accounts):** 87 14 of 14; 88 2 of 2; 89 2 of 2; 90 (chart from table, review then fix, split) 3 of 3; 91 (chart style, picture panel, crop, group, group resize) 6 of 6; 92 (story advice, confirm for turning off every animation, step by step with the continue button, the upgrade button on a Pro plan) 4 of 4.
**Final regression:** typecheck clean; lint 0 errors; api 1497, theme 883, editor 531, ui 124, api-client 18, ai 54; 230 scenarios plus the honesty property test (6 seeds); real-model eval 96 of 97 on the last full run plus fixes re-run (the miss: asked for a shadow on heading text, the model once changed bold instead of refusing: variance, known).

**Still open:** brand from a logo FILE; "use slide N's design" as a reference; swap two slides, expand a deck to N slides, shape gradient and arrow, table highlight and number formats, custom footer text, typewriter effect, a `verified_changes` metric; a note for palette changes on a Morph deck; grouped objects are separate objects in the PowerPoint file; real PowerPoint opening of an export; the Photoroom checks above (key, terms, privacy text, live call).


## 29. The open points of section 28, fixed (2026-11-20)

**Built, tested, and run live on the saved deck (suite 93, real model, 6 of 6):**
- **Swap two slides** (`move_slide` with `where: swap`): planned as moves, one undo step; the order was proved on the document (`swap-slides.test.ts`) and live.
- **"Make slide N look like slide M"** (`layout` with `like`): the layout of slide M is the layout asked for; a hand-built or template slide has none to copy and is refused with the reason.
- **Expand the deck to N slides:** `add_slide` now takes up to 15; four or more are asked first with the cost ("counts as two edits"), confirmed with a button (`add_bulk`), then written.
- **Arrows and gradients on shapes:** `arrowRight/Left/Up/Down/Both` for `add_shape`; `gradient` (two deck colours or hex, an angle) for `shape_style`, verified on the shape.
- **Table highlight and number formats:** tables gained per-cell `highlights` (drawn on screen, in the PowerPoint file, text colour chosen to read); `table_highlight` (highest, lowest or clear, found by code from the numbers) and `table_format` (thousands separators, percent, dollar, rupee, euro, pound, decimals: the value of every number is unchanged, cells that are not numbers are left and counted).
- **Custom footer text:** `theme.style.footerText`, drawn at the bottom left instead of the deck title, exported to PowerPoint. It must be the person's own words, written in their message.
- **Typewriter:** is the `appear` effect by letter (said in the guide); no new effect was needed.
- **Brand from an uploaded logo file** (`brand` with `logoFile`): the upload is chosen by name or "latest", its shape and brand colours are read from its pixels in code (`media/logo-colours.ts`: transparent, white and grey are ignored; a black-and-white logo has no colour and the colours stay), and the logo is applied with those colours.
- **Palette note on animated template decks:** MEASURED, not assumed: on a Morph deck a palette change and dark mode leave every slide exactly as it was (the artwork keeps the template's colours). The assistant now says so, and that the new colours show on slides added later.
- **`verified_changes` metric:** `GET /admin/ai-honesty?days=N` (admins only): per kind of change, how many promises were verified on the saved deck, not, unchanged or failed, plus requests with nothing verified and how often the browser disagreed (`assistant/honesty-report.ts`).

**Assistant wording fixes found by the real model:** the shadow-on-text refusal now names headings and titles (3 of 3 afterwards, it failed twice before); the first-step prompt had to be trimmed again to stay under its size guard (3,500).

**Not done, and why:**
- **Groups in the PowerPoint file.** The export library has no groups, and wrapping shapes by editing the file's XML cannot be proved correct here (no PowerPoint to open it in), while a wrong wrapper can corrupt a deck or break animations that point at the shapes inside it. Grouped objects stay separate objects in the file.
- **Opening an export in real PowerPoint or Google Slides.** Nothing here can do that.
- **Photoroom:** a key, the commercial-use terms for output pictures, the privacy text, rate limits, our credit price against the cost, and one live call with a `sandbox_` key are the owner's (section 28 and `BACKGROUND_REMOVAL_PROVIDER_DECISION.md`).
- **A screen for highlights:** highlights are set by the assistant and drawn and exported; the table editor has no control for them.

**Live suites now:** 87 (14), 88 (2), 89 (2), 90 (3), 91 (6), 92 (4), 93 (6): all pass. Unit: api 1,508, editor 559, theme 883, ui 128; typecheck clean; lint 0 errors; real-model eval 94 of 98 on the last full run, the four misses re-run singly (three passed; the fourth is the text shadow, fixed by the wording above).

