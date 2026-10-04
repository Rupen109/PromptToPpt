# Template redesign — plan & progress tracker

Goal: every one of the 120 templates should look like it belongs to its **category** (an Education deck looks like a classroom,
a Tech deck like an engineering doc, Reports like a data brief…), instead of 10 categories wearing the same 22 layouts in
different colours. Keep what already works; replace what repeats.

Status key: ☐ todo · ◐ in progress · ☑ done. Update this file as work lands.

---

## 1. Audit (what we have today)

120 designs = 10 categories × 12, built from `designs.ts` rows → `build.ts` (palette + fonts + **kit** + motion).

| Finding | Evidence | Consequence |
|---|---|---|
| All categories share the same 22 style kits | classicBar ×9, frameBar ×9, serifFrame ×8, bandSide ×8, frameGrid ×8, centerDot ×8, minimalSoft ×8 … | Education looks like Pitch with other colours |
| Every category uses 10–12 of the 22 kits | per-category kit counts 10–12 | no category has a signature composition |
| Same 9 decor motifs everywhere (circles, dots, grid…) | `decor.ts` | no subject-matter cues (paper, chalk, blueprint, charts) |
| Same 6 photo frames everywhere (full 40, frame 25, arch 22, split 15, circle 12, diagonal 6) | `build.ts` | gallery thumbnails look alike (see Case Studies screenshot) |
| Fonts: 20 families spread evenly; no category voice | DM Sans ×11, Jakarta ×9, Outfit ×9 | serif/handwritten/mono not tied to topic |
| Same placeholder story for every design in a category | `skeletons.ts` (one deck per category) | previews differ only by colour |
| Content slides mostly "title + bullets" cards | `content.ts` | monotone decks (also reported in chat) |

What is **not** waste (keep / re-home): palettes and fonts that already suit a category (Boardroom, Founder Story, Vector,
Blueprint, System Design, Cloud Native, Campaign Pop, Brand Story …). The per-category tables below say keep / rework / move.

## 2. Competitor notes (what we can learn)

Research done 2026-10-04 (app.presentations.ai is a JS app with no readable content; its public template page and MagicSlides'
site were read instead):

* **Presentations.ai** groups templates by *slide type*, not just topic: Basic, List, Data & Charts, Visual Impact (photo, quote,
  word cloud), Diagrams & Timelines (kanban, funnel, journey, Venn), Comparison (SWOT, XY, A/B), People & Product.
  → We add the missing *diagram-style* layouts (pillars, icon cards, journey/timeline with chips, funnel, SWOT) so decks stop being bullets-only.
* **MagicSlides** sells 500+ templates by *topic* (Business, Education, Marketing, Medical, Technology) **and by style**
  (Minimalist, Dark, Colorful, Craft & Notebook, Doodle, Watercolor, Floral, Vintage, Duotone, Illustration…).
  → We add a **style axis** to the gallery (Minimal · Bold · Dark · Playful · Editorial · Craft) next to category, and give categories
  signature styles (Education = Craft & Notebook / Chalkboard, Marketing = Colorful/Pop, Tech = Dark/Blueprint).
* Both lean on **photography + large type + one signature motif per template** rather than many ornaments.

## 3. Art direction per category (the signature each must have)

| Category | Feel | Palette family | Type | Signature motif (new) | Photo treatment | Slide mix emphasis |
|---|---|---|---|---|---|---|
| Pitch & Investors | bold, cinematic, confident | deep indigo/violet/black + neon accent, gradient glow | geometric sans (Space Grotesk, Sora, Montserrat) | glow orbs, thin gradient rules | full-bleed dark photo, glow overlay | big-number, chart, metrics |
| Sales & Proposals | decisive, trustworthy, energetic | navy/royal blue, orange/amber, emerald | strong sans (Montserrat, Oswald, DM Sans) | chevrons / arrows / scoreboard bars | diagonal & band crops | comparison, table, process |
| Marketing & Campaigns | loud, colourful, playful | hot pink, orange, cyan, lime, multi-colour | display/rounded (Poppins, Bebas, Nunito) | confetti, tape, stickers, halftone | collage-like tilted frames, circles | split-image, timeline, chart |
| Business & Strategy | executive, restrained | navy, charcoal, ivory + gold/burgundy | serif headings (Playfair, Fraunces, Merriweather) | hairline rules, corner brackets, fine grid | quiet framed photos | agenda, matrix, roadmap |
| Product & Roadmap | clean SaaS-UI | white/cool-grey surfaces + gradient chips | modern sans (Jakarta, Manrope, Outfit) | window chrome, dot chips, soft shadow cards | rounded device-style frames | roadmap, process, comparison |
| Technology & Architecture | engineering, terminal | slate/black + cyan/green/magenta | mono + grotesk (Space Mono, Plex, Grotesk) | blueprint grid, circuit nodes, glow lines | dark duotone, hexagon/grid crop | architecture, process, table |
| Reports & Analytics | data-first, calm | white/ivory + 1 strong hue, greys | tabular sans (Plex, Work Sans, DM Sans) | axis ticks, gridlines, bar glyphs | small inset photos only | metrics, chart, table |
| Education & Training | friendly, bright, tactile | chalkboard green, notebook cream, primary colours | rounded/humanist (Nunito, Fraunces, Lora) | ruled paper + margin line, chalk dust, stars, squiggles | polaroid / taped frames | agenda, process, quote, matrix |
| Case Studies & Consulting | editorial, evidence | muted ink, stone, one accent | serif + sans (DM Serif, Lora, Plex) | column rules, big quotation marks, brackets | magazine split, tall crops | case-study, quote, comparison |
| Team & HR | warm, human | soft pastels, terracotta, sage | friendly sans/serif (Nunito, DM Serif) | organic blobs, hand-drawn underline, avatar circles | circle portraits, rounded collage | team, quote, agenda |

## 4. Work streams

### W1 — Engine: new signature motifs (`DECOR_STYLES` + `decor.ts`)  ☑ (2026-10-04)
`ruled-paper` (lines + margin) · `chalk` (dust + squiggle) · `blueprint` (fine grid + corner ticks) · `circuit` (nodes + traces)
· `confetti` · `halftone` · `axis` (chart ticks/gridlines) · `brackets` (corner brackets / quote marks) · `chevrons`
· `organic` (soft hand blobs) · `window` (UI chrome dots). All decorative, low-contrast, validated. Tests: every motif × aspect ratio × light/dark.

### W2 — Engine: new title compositions + photo frames  ◐ `polaroid` frame done; `editorial`/`poster` titles, hex frame, tilted collage still todo
`editorial` (large serif, hairline, caption column) · `poster` (oversized uppercase type) · `polaroid` photo frame (tilt + tape)
· `hex` frame · `tilted-collage` (3 overlapping photos). Tests as above.

### W3 — Engine: new card + header styles  ◐ cards `paper`, `sticker` and header `italic` done; `glass`, `notch`, `tab`, `bracket` todo
Cards: `paper` (notebook card), `sticker` (rounded + offset border), `glass`, `notch` (cut corner). Headers: `highlight`
(italic underlined word, like the reference images), `tab` (label tab), `bracket`.

### W4 — New content layouts (from the editorial reference images)  ☐
`pillars` (4-quadrant donut + stats panel) · `icon-cards` (3 cards + narrative panel) · `journey` (alternating timeline with chips)
· `funnel` · `swot`. Added to schema, generator prompts, layout engine, quality gate and tests; AI picks them so decks vary.

### W5 — Per-category sample decks (`skeletons.ts`)  ☐
Each category's placeholder story rewritten in its own voice and layout mix (table in §3), so previews differ by *structure*, not just colour.

### W6 — Rewrite the 120 design rows (`designs.ts`)  ◐ pass 1 done: every design now has its own motif/card/photo-frame/header via `style` overrides; palettes and fonts of the weakest repeats still to rework (pass 2)
Per category: assign signature motif + title/photo style + palette + fonts. Keep ≥ 50% of today's best, replace repeats.
Rule: within a category no two designs share the same (title, photo, decor) triple; across categories signature motifs are unique to it.

### W7 — Category photography  ☐
Generate the missing template photos (19 of 100 failed earlier; model id bug fixed 2026-10-04) and add 4 style-specific sets
(chalkboard/classroom, blueprint/tech duotone, collage/marketing, portrait/team). Manifest keeps decks safe if a picture is missing.

### W8 — Gallery  ◐ cards now show the title slide + 3 content slides; style filter chips, per-category sample titles and "recommended for" tags todo
Style filter chips (Minimal · Bold · Dark · Playful · Editorial · Craft) beside category tabs; category-specific sample titles in previews
(not "How Acme cut resolution time" everywhere); "Recommended for" tag per template.

### W9 — Verification  ☐
Unit: every design × layout × aspect composes with 0 errors (existing suites). Visual: screenshots of all 120 thumbnails per category
reviewed before ticking the category. E2E: templates suite (create from template, upgrade lock, filters).

### W10 — Patterns from the Presentations.ai reference decks (6 share links, ~70 slides reviewed 2026-10-04)  ◐
Captured with `node e2e/ref-shoot.mjs <share-url> <name>` (contact sheets in `e2e/results/ref/`). Decks: Stripe reorg (strategy), DoorDash retention (reports),
Airbnb UX study (case study), Asana OKRs (product/strategy), Docebo (sales/tech), JPMorgan AI (finance/consulting).

| Pattern seen | What we built | Status |
|---|---|---|
| Cinematic cover: photo under a two-colour duotone, serif/condensed title left, line-art contours (DoorDash, Asana, Docebo, the user's dental cover) | `photo: 'wash'` + `decor: 'contours'` | ☑ |
| Photo banner on top, title below with the key phrase in the brand colour (Stripe) | `photo: 'banner'` + run colour / `emphasised()` | ☑ |
| Hexagon-cropped photo with an outlined hex lattice, serif title (JPMorgan) | `photo: 'hex'` (clip) + `decor: 'hexgrid'` | ☑ |
| Flat geometric shapes cover (Airbnb) | `decor: 'shapes'` (cover-only; not used by a design yet) | ◐ |
| Key words of a heading in the accent colour; hairline across the top | text-run `color` + header `accent` | ☑ |
| Heading left, vertical divider, numbered list right (Stripe, DoorDash, JPM) | agenda → `agendaSplit` | ☑ |
| Row of chevron groups in a colour ramp with stem + centred text (Docebo) | process/timeline → `stepsChevrons` | ☑ |
| Soft gradient stat cards with huge figures (DoorDash) | metrics → `metricsWash` | ☑ |
| Hub-and-spoke diagram beside the heading (Stripe) | matrix → `matrixHub` | ☑ |
| Heading top-left, huge figure bottom-right (DoorDash 78%, JPM 1.5B) | big-number → `bigNumberCorner` | ☑ |
| Condensed uppercase headings (DoorDash, Asana, Docebo) | Oswald / Bebas on Reports, Tech, Education, Case Studies picks | ◐ (5 designs) |
| Metaphor diagrams: lightbulb, iceberg, umbrella, pyramid, gears, target | not built (need illustrated shapes) | ☐ |
| Curled-paper gradient-ramp cards, avatar lists | not built | ☐ |

Opt-in per design through `style.diagram: 'editorial'` (wide canvases only; 4:3 and 1:1 fall back to the classic look). About five designs per category use it.
Wash covers: 2 designs per category. Banner and hex covers: 1–2 per category.

## 5. Category checklist (do in this order)

Order = most visible / most different first. A category is ☑ only when: motif implemented, all 12 rows rewritten, sample deck
rewritten, photos present, screenshots reviewed, tests green.

| # | Category | Motifs/engine | Rows (12) | Sample deck | Photos | Review | Done |
|---|---|---|---|---|---|---|---|
| 1 | Education & Training | ☑ | ☑ | ☐ | ◐ (library has few distinct education photos) | ☑ viewed | ◐ |
| 2 | Technology & Architecture | ☑ | ☑ | ☐ | ☑ | ☑ viewed | ◐ |
| 3 | Marketing & Campaigns | ☑ | ☑ | ☐ | ☑ | ☑ viewed | ◐ |
| 4 | Reports & Analytics | ☑ | ☑ | ☐ | ◐ (3 city/office photos repeat) | ☑ viewed | ◐ |
| 5 | Team & HR | ☑ | ☑ | ☐ | ☑ | ☑ viewed | ◐ |
| 6 | Case Studies & Consulting | ☑ | ☑ | ☐ | ◐ (some prompts blocked by safety filter) | ☐ screenshot taken, not reviewed | ◐ |
| 7 | Business & Strategy | ☑ | ☑ | ☐ | ◐ (strategy-1/2/5 not generated yet) | ☐ screenshot taken, not reviewed | ◐ |
| 8 | Product & Roadmap | ☑ | ☑ | ☐ | ☑ | ☐ screenshot taken, not reviewed | ◐ |
| 9 | Sales & Proposals | ☑ | ☑ | ☐ | ◐ (sales-9 missing) | ☐ screenshot taken, not reviewed | ◐ |
| 10 | Pitch & Investors | ☑ | ☑ | ☐ | ◐ (pitch-10 missing) | ☐ screenshot taken, not reviewed | ◐ |

### Keep / rework / move (first pass — confirmed per category when we reach it)

* **Keep as is (suit their category):** Boardroom, Executive Brief, Annual Review (strategy) · Founder Story, Vector, Launchpad (pitch)
  · System Design, Blueprint-style looks (tech) · Brand Story, Campaign Pop (marketing).
* **Move:** "Town Hall" (strategy) → Team & HR · "Renewal Review" serif look → Case Studies · "Beta Program" dark → Tech.
* **Rework (generic repeats of classicBar / frameBar / minimalSoft):** the third-and-later duplicates inside each category; decided per category.

## 6. Progress log

| Date | Step | Result |
|---|---|---|
| 2026-10-04 | Audit of 120 designs (kits, fonts, photo frames, decor) | done — findings in §1 |
| 2026-10-04 | Competitor review (Presentations.ai, MagicSlides) | done — §2 (their app UIs are not scrapable; used public pages) |
| 2026-10-04 | Plan written | done |
| 2026-10-04 | Image model id bug in `template-images.ts` fixed; missing photo generation re-run | in progress (some prompts blocked by safety filter → reworded in W7) |
| 2026-10-04 | W1: 11 signature decor motifs (ruled-paper, chalk, blueprint, circuit, confetti, halftone, axis, brackets, chevrons, organic, window) + `decor.test.ts` | done, 376 theme tests green |
| 2026-10-04 | W2/W3 (partial): polaroid frame, paper + sticker cards, italic header; photo slides now draw the design's motif | done |
| 2026-10-04 | W6 pass 1: all 120 designs given distinct motif/card/photo/header; Education fully re-themed (12 rows) | done; validator now ignores small decorative shapes in contrast backdrop |
| 2026-10-04 | W8 (partial): gallery cards show title + 3 content slides; `e2e/shoot-templates.mjs <Category>` captures a category for review (`e2e/results/templates/`) | done |
| 2026-10-04 | Review: Education, Tech, Marketing, Reports, Team screenshots viewed — clearly distinct per category | done; remaining 5 categories pending review |
| 2026-10-04 | Fixed `template-images.ts` model id (needed provider prefix); re-run still blocked on some prompts by the safety filter | open → reword prompts (W7) |

| 2026-10-04 | Light/dark rule (user): every category is 6 light + 6 dark, and the dark ones use different hues (charcoal, navy, forest, burgundy, brown, plum…). Applied to all 10 categories; `designs.test.ts` now enforces 6/6 and ≥5 distinct dark backgrounds per category | done |
| 2026-10-04 | Marketing hero photo: replacing the notebook/headphones flat-lay (`marketing-1`) with a vibrant campaign scene; 60 new scene photos (slots 11–16 per category) + wider photo pools; generation with the lite image model (~$0.034/photo) because the balanced model is out of quota | in progress |

| 2026-10-04 | User: pure yellow `#FFDE4D` (Golden Brief, Business #4) and deep green `#10490F` (Evergreen, Business #6) as the main ground colour; explicit `ground` colour added to the palette engine | done |
| 2026-10-04 | W10 implemented: wash/banner/hex covers, contours/hexgrid/shapes decor, run colour, header `accent`, editorial layouts; applied to ~50 designs; 388 theme tests green | done (visual review of remaining categories pending) |

## 7. Next steps (in order)
1. Review screenshots of Case Studies, Strategy, Product, Sales, Pitch; fix weak spots.
2. W5: category-specific sample decks (placeholder copy + layout mix), so previews differ in structure.
3. W4: new content layouts (pillars, icon-cards, journey, funnel, swot) from the reference images.
4. W7: finish photography (reword blocked prompts; add category-specific sets).
5. W6 pass 2: replace remaining repeated palettes/fonts; move Town Hall → Team etc.
6. W8: style filter chips; W9: e2e + full regression.
