# Object animations, transitions and Morph

Owner spec (2026-11-05): PowerPoint-style animation. **Gold and Premium** get object animations, the Animation Pane and Morph; the basic slide transitions (fade, slide, zoom, push, wipe) and the theme's automatic entrance stay on every plan. A deck that was built on Gold keeps playing its animations after a downgrade; editing them is locked (deleting them is allowed).

## Status
| Phase | What | State |
|---|---|---|
| 1 | Data model, plan flag `animations`, migration 0042, server gate, editor commands + undo | done |
| 2 | Timeline engine, player, 27 effects (entrance, emphasis, exit), Present mode integration | done, verified in Chromium (suite 58) |
| 3 | Animation Pane (right drawer `components/editor/animation/`), ribbon Animations dropdown (basic transitions for all plans; Morph set / apply to all / remove, locked with upgrade prompt below Gold), `editor/transition-commands.ts` | done, verified in a real browser (Starter and Gold) |
| M1 | Morph data (`slide.transition.type = 'morph'`, easing, direction, `own`), server gate, Duplicate Slide keeps element ids, Morph engine (`planMorph`, `carry`, `MorphLayer`), Present mode | done, verified in Chromium (suite 59) |
| M2 | The Morph layout family: layout `morph` with 12 scenes drawn from one cast of elements with stable ids (`packages/theme/src/layout/morph.ts`), content shape `{layout:'morph', scene, title, kicker?, subtitle?, items[0-4], focus?, stat?, image?}` | done: 66 layout tests (every scene × theme × aspect ratio × style variant) and a real-browser run |
| M3 | Generation: ONE planning call (concepts + ordered scenes), code enforces the story rules, the deck's one hero picture, `morph` job option with the Gold gate, the create-page option | done: unit + API tests, real-AI browser suite 60, real decks reviewed by eye |
| 4 | Transitions panel (None / Morph / Fade / Push / Wipe / Zoom, duration, easing, Preview, Apply to All, Remove) and the Morph layouts in the layout picker for Gold/Premium | planned |
| 5 | Motion paths (line, curve, arc, circle, custom) | planned |
| 7 | Shared view on the same player, PPTX export (effects, Morph), exported HTML stays static | planned |

## How it works
- **Data** (`packages/validation/src/presentation.ts`): `slide.effects[]`, one list per slide in play order. Each effect has its own id, the `elementId` it plays on, `category`, `type`, `start` (`click` | `with` | `after`), `duration`, `delay`, `easing`, and the options its type understands. Absent on every slide saved before this (no version bump).
- **Catalogue** (`packages/ui/src/motion/catalog.ts`): the one table of effects: label, which options each understands, whether the end state stays, which element types it works on. The editor reads it, so no control is shown for an option an effect ignores. Nothing is added to the schema list before the engine plays it.
- **Timeline** (`timeline.ts`): turns the list into steps. Step 0 is automatic (before the first On Click); each On Click starts a step; With Previous shares the previous start, After Previous follows the previous end; delays are added.
- **Keyframes** (`keyframes.ts`): transform / opacity / clip-path / visibility only. Entrances start hidden and end visible, exits end hidden, one-off emphasis ends where it began.
- **Player** (`player.ts`): no timers. A step is handed to the browser's animation clock with offsets; click while moving finishes it; Back takes one step back at once; `showAll()` for a slide you come back to; `destroy()` cancels everything. The saved slide is never touched.
- **Renderer** (`SlideCanvas` prop `effects`): elements with effects sit in a wrapper `data-pt-el`, hidden from the start when their first effect is an entrance; the theme's entrance steps aside on such slides (ambient loops stay).
- **Editor commands** (`apps/editor/src/editor/effect-commands.ts`): add / update / remove / duplicate / move; adding an effect marks the slide hand-edited so a theme swap keeps its elements. Deleting an element, laying the slide out again, or an AI rewrite removes the effects that would point at nothing. Duplicate Slide copies effects with new ids pointing at the copy's elements.
- **Server gate** (`services/api/src/billing/animation-gate.ts`, save route): effects may not be added or changed without the `animations` feature; judged against the stored deck, key-order independent.

## Morph
- **Matching** (`motion/morph.ts`): the same element = same id and same type, never by words, picture or name. Duplicate Slide keeps element ids (an id only has to be unique within its slide); SVG gradient ids include the slide id so two slides on one screen cannot collide.
- **Drawing** (`motion/MorphLayer.tsx`): both slides on one canvas. Every matched element is two copies, each carried onto the other's place with `transform` and `opacity` only (boxes by corner and size; text by its centre and an even scale by font size, so words never stretch or reflow). One clock (Web Animations), nothing laid out while it plays, nothing saved. An element on one slide only comes in or goes out; the backgrounds cross over.
- **Fading:** a copy fades in over the old one, which stays solid underneath (no dip). Text whose words change, or that wraps differently in its new box, cross-fades instead (a brief overlap in the middle is inherent).
- **Present mode:** forward uses the destination slide's transition; backward plays the leaving slide's in reverse. A key pressed during a Morph finishes it. The destination's own effects start afterwards. Reduced motion: no overlay.
- **Choice kept:** `transition.own` marks a transition a person (or Morph generation) set; re-layout, theme swap and AI rewrite keep it, where a transition taken from the theme is replaced.
- **Gate:** a Morph may not be added or changed without the `animations` feature (same rule as effects).
- **PPTX export:** a Morph slide is exported as Fade until the PowerPoint Morph transition is written.

## Morph layout family (decided 2026-11-05)
Twelve layouts drawn from ONE cast (title, kicker, hero picture, up to four cards each with number/heading/text, accent shapes, one stat) with the same element ids on every slide of a Morph deck: cover, hero left, cards in a row, cards stacked beside the hero, 2×2 grid, spotlight (one card enlarged), timeline, big stat, compare, focus hero, quote, closing. The model writes the 3-4 concepts once and orders the scenes; the code enforces the rules (cover first, closing last, no layout more than twice in a row, spotlight only after an overview), assigns ids and sets Morph transitions on slides 2 and up; a built-in story order is the fallback. Used only when the Morph switch is on, and offered in the layout picker for Gold and Premium. The twenty existing layouts are unchanged.

## How the Morph scenes are built (M2)
- `layout: 'morph'` is ONE layout id; `content.scene` is one of the twelve (`MORPH_SCENES`). It is left out of `GENERATABLE_LAYOUTS` (ordinary decks never get it) and out of the assistant's layout list. The "same layout 3 times in a row" rule counts scenes.
- Every part has a fixed id (`m-title`, `m-kicker`, `m-sub`, `m-hero`, `m-c0…m-c3` with `-n` / `-h` / `-t`, `m-stat-value`, `m-stat-label`, `m-accent-1`, `m-dot-i`, `m-decor`, `m-logo`), whatever id generator is used. A card's background parts are named by the theme's own card style, so the look follows the design.
- No element carries an entrance animation: a Morph deck moves by its transitions. Every Morph slide arrives with `{type:'morph', duration:1200, easing:'power2-in-out', own:true}`.
- Dramatic scenes (cover, focus-hero, closing) use the design's title background; the others its body background. The picture is the deck's one picture (a colour block stands in when there is none).
- When the words do not fit (a squarer canvas, long text) the scene is drawn again with less: first without kicker and subtitle, then also without card numbers. Text that still does not read against what is really behind it is recoloured.
- Measured on the real scenes: between card scenes 19 of ~20 elements are matched, so cards move and regroup. Cover → picture scenes share fewer parts (mostly crossfade).
- Not reachable yet: nothing creates a Morph slide until M3 (generation and the create-page switch) and the layout picker (phase 4) land.

## Morph scenes, redesigned (2026-11-08, after the owner's feedback)
The first scenes moved the same cards between very different shapes (a wide card, a thin list row, a mini card), so the Morph had to stretch and cross-fade them and the slides did not feel connected. The scenes are now built from RIGID parts:
- **Cards** are one fixed-proportion tile (500 × 380 at scale 1). A scene only chooses a position and one scale. Text is fitted ONCE per deck (one heading size, one body size, measured a little narrower than the box), so it wraps the same way at every scale and a Morph is a clean move and resize. A card too small to read its body (under about 20 px) shows number and heading only; its body fades out first when it leaves its big form and in last when it arrives.
- **The picture** is always 4:5 and only ever scales, so it never re-crops.
- **The header** (kicker, title, subtitle) is in the same place at the same size on every content scene; only the cards and the picture move.
- **Motion:** default 900 ms; the cards leave a little apart (7% of the duration each) and arrive together; a text whose words change fades out, then the new one fades in (no overlap).
- Tests assert these properties (`morph.test.ts`: wrap ratio constant across scenes, picture 4:5, header unchanged, body shown only when big).

## How a Morph deck is generated (M3)
- **Job option** `morph` (new presentations only; remix, rewrite and pictures-only are refused). The server checks the plan (`assertAnimations`), never the browser. The create page shows the option on the length step to every plan: a checkbox on Gold/Premium, a locked button with the upgrade prompt on the others. It sits above the length buttons because choosing a length starts the build.
- **Pipeline** (`generation/pipeline.ts`, `morphDeck` branch): analysis and design as for any deck → ONE model call (`morphPlanPrompt`, request type `outline_generation`) returns the 2-4 concepts, the ordered scenes with their words and speaker notes, and what the hero picture should show → `sanitizeMorphPlan` → the slides appear at once (colour block for the picture) → the hero is looked up (the normal picture session, one request) → final write. No outline call, no slide batches, no critic: one call instead of one per batch.
- **Rules the code enforces** (`generation/morph-plan.ts`, never left to the model): exactly the asked number of scenes (a short plan is filled from the built-in story); cover first, closing last; a spotlight only after the concepts were shown side by side, each on a different concept in turn; never the same scene three times in a row; a quote only when the user supplied a real quotation; a big stat only when the user supplied a figure; figures the user never gave are removed from the words. If the model's plan is unusable, the built-in story order is used.
- **The cards are the same on every slide.** Condense (the shorten-on-overflow pass) never touches a card on a Morph slide, and small card text does not trigger it (it only drops the subtitle and kicker and shortens the title). Waiting cards on a spotlight and the concepts on a hero-left slide show number and heading only.
- **Ids**: the final build does not rename Morph elements (the progressive-write renaming is for ordinary slides). `harmonizeType` skips Morph slides (their scenes keep their own scale).
- Cost: one call, so a Morph deck costs less to make than an ordinary one; the credit estimate is unchanged.

## Known gaps / decisions still open
- Duplicate Slide on a downgraded account copies effects, which the server then refuses on save: the pane (phase 3) must strip them in that case.
- Re-layout or an AI rewrite of a slide drops its effects (its elements are new). Say so in the UI when it happens (phase 3).
- Copy/paste of elements does not copy their effects.
- The standalone exported HTML is static.

## Tests
`packages/ui/src/motion/motion.test.ts` (catalogue, all 27 effects' start/end state, timeline rules, player with a stand-in clock, renderer), `apps/editor/src/editor/effect-commands.test.ts`, `services/api/src/billing/animation-gate.test.ts`, the save-route test in `routes/presentations.test.ts`, and the browser suite `e2e/suites/58-object-effects.mjs` and `59-morph.mjs` (need the API with email verification off).

## Morph templates (Space, Product Launch, Education, Cool Morph, Business Plan)

A Morph template is the choreography of a whole deck (`packages/theme/src/morph-templates`): per scene, where every object is, its size and rotation, and which objects are the same object on the next scene. Geometry and text styling come from a source deck, never its pictures; the pictures are ours (`pictures` by hash), the words are `fields`. `composeTemplateScene` turns a scene into slide elements, with `blend: 'cross'` (PowerPoint-style crossfade) and `durationMs: 1500`.

- **Import:** `scripts/morph-import.mjs <deck.pptx> data/<name>.ts` for a PowerPoint deck; `scripts/morph-import-canva.mjs <canva view?embed url> data/<name>.ts NAME --font X --body-font Y` when only a Canva link exists (it opens each slide in a headless browser, measures every object, and checks by pixels which pictures are really painted).
- **Artwork:** `scripts/gen-morph-photos.mjs [--only name,name]` makes the pictures with a Gemini image model (`gemini-3-pro-image`, ~$0.13 each) into `apps/web/public/morph-templates`. Cut-outs are made on a flat key colour and keyed out; glows and planets use their brightness as transparency; the script rejects cut-outs sliced by their frame and retries. `scripts/gen-space-assets.mjs` makes the Space star field and planet line-up.
- **Cache:** bump `MORPH_ART_VERSION` in `compose.ts` whenever a picture is regenerated (files are cached for a day; the version is in each picture URL).
- **Typography rules (ours, not the source's):** body copy lifted to a readable size with a 1.4 line height, headlines semibold (or the template's `headingWeight`), lines that were one line in the source stay one line, tickers rest inside the margins.
- **Public page:** `/morph-animation-templates` (live previews, FAQ with JSON-LD, sitemap, llms.txt). Add a template to `registry.ts`, `demos.ts` (sample copy per scene) and the FAQ in `apps/web/lib/morph-page.ts`.
- **Tests:** `morph-templates.test.ts`, `demos.test.ts` (theme), `morph-template-assets.test.ts` (API: every picture file exists, every SVG is safe).

## The template library (23 templates, 6 families)

Families (`MorphCategory`): business, pitch, marketing, launch, technology, education. Five templates were imported from source decks (Space, Product Launch, Education, Cool Morph, Business Plan); eighteen were **authored from scratch** with `packages/theme/src/morph-templates/author.ts` (Orbit Pitch, Strategy Matrix, Roadmap, Annual Report, Market Pitch, Story Cards, Billboard Campaign, Social Feed, Brand Moodboard, Unboxing, Feature Spotlight, Countdown, Neural Network, Dashboard, Circuit, Chalkboard, Science Lab, Learning Atlas). **How to author one, the choreography techniques and the quality bar: `docs/MORPH_TEMPLATE_AUTHORING.md`.**

Tools: `scripts/morph-preview.mjs <id> [--transition N | --scene N]` (look at a template: scene sheets and mid-transition frames), `scripts/gen-morph-photos.mjs --only name,...` (pictures; per-template specs in `scripts/morph-art/<id>.mjs`; `--model gemini-3.1-flash-image` when the Studio model's 250/day quota is spent), `scripts/morph-posters.mjs [id...]` (the still on the hub tiles, `apps/web/public/morph-posters`; re-run after a template changes).

Website: `/morph-animation-templates` (families, one featured live preview) and `/morph-animation-templates/<family>` (live previews of that family's templates, FAQ with JSON-LD); copy in `apps/web/lib/morph-categories.ts`. Suite `e2e/suites/61-morph-templates-page.mjs`.

Known limits: document schema caps font size at 600 px, line height at 2.2 and polygons at 64 points; text crossfades overlap briefly mid-transition; rotated thin rects that change size or rotation can show stray copies during a Morph (give each line a fixed geometry and fade it); PowerPoint export still turns a Morph into a Fade.
