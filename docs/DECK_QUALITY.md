# Deck quality: typography and template choice

Owner's report (2026-10-30): every generated deck looked the same, and the font sizes did not match the slide ("clearly looks AI generated").
This page records what was found, the rules adopted, what changed, and how it was measured.

## What was wrong (measured on 2,140 real AI decks in the development database)
| Finding | Number |
|---|---|
| Median body text | **30 px = 15 pt** (best practice for a presented slide: 18–24 pt) |
| Body boxes smaller than 15 pt | 50% |
| Smallest text a layout could shrink to | 11 px (5.5 pt): unreadable |
| Median content-slide title | 60 px = 30 pt (guidance: 36–44 pt) |
| Tall text boxes filled by their words | roadmap 23%, timeline 10%, metrics 28%, comparison 39%, title-body 37%: small text lost in a big empty card |
| Template | chosen only by a hash of the prompt inside the topic's category (10 categories) |
| Light / dark | **every AI deck was forced dark**, whatever template was chosen, so the 6 light designs per category never appeared; background tint of the design was dropped too |

## Rules adopted (web research, 2026-10-30)
The canvas is 1920 px wide = 13.33 in, so **1 pt = 2 px**. The sources agree on the principle and differ on exact numbers (many are vendor blogs, not standards), so these are the middle of the range:
* Titles 36–44 pt; subtitles 28–32 pt; body 18–24 pt (18 only for dense slides); captions ≥ 14 pt (some sources: 12 pt minimum). [Presentations.AI](https://www.presentations.ai/blog/what-font-size-is-best-for-presentations), [Beautiful.ai](https://www.beautiful.ai/blog/what-font-size-is-best-for-presentations), [Slidor](https://site.slidor.fr/en/blog/quelle-taille-de-police-minimum-pour-powerpoint)
* A fixed size per level, repeated on every slide; titles the same size and position on every slide. [PresentationGo](https://www.presentationgo.com/?p=183642), [Slideworks](https://Slideworks.io/resources/how-mckinsey-consultants-make-presentations)
* Heading about twice the body; line height 1.3–1.6; avoid thin weights when projected; at most two fonts. [SlidesAI](https://www.slidesai.io/blog/the-best-tips-for-using-fonts-in-presentations), [MagicSlides](https://www.magicslides.app/blog/how-to-effectively-use-typography-in-slides)
* Less text per slide (6×6 or 7×7 rules of thumb). AI generators often produce a title/body scale that does not match: use a modular scale. [hiData](https://hidata.ai/blog/ai-slide-design-spacing-alignment-typography/)

## What changed
**Type scale** (`packages/theme/src/layout/primitives.ts`, `scaledSize`, `TYPE_FLOOR`): layouts ask for a size, the scale lifts it to a readable one (body ×1.4 up to 48 px, headings ×1.2 up to 52, captions ×1.25 up to 32, subtitles ×1.2 up to 44) and gives each role a floor (title 44, subtitle 26, heading 26, body 24, caption 20) the fitter may shrink to. Content-slide titles start at 68 px (was 60).
**One size per level** (`layout/harmonize.ts`, applied in `composeDeck`): all text of the same role on the same layout (all content-slide titles are one group) is pulled to the group's median; a box is only ever made smaller, so nothing can start to overflow.
**Cards hug their words** (`hug()`, `textNeed()` in `primitives.ts`; roadmap, comparison, process/timeline, team) instead of stretching to the slide's bottom, and the block sits in the room under the title. Agenda lists use bigger type and sit in the middle; grids balance their rows (6 = 3+3, never 5+1).
**Too-small text is no longer shipped**: the validator flags reading text under 22 px (`small_text`); the generator then shortens that slide's words (the existing condense pass) instead of leaving tiny type.
**Template chosen for the topic** (`services/api/src/generation/design-pick.ts`): after the analysis, one small, cheap model call (`design_pick`, fast route) reads topic, audience and tone against the topic's category shortlist (tagline, light/dark, fonts) and names the template. The Starter plan only sees its free designs; an unknown id, a failing call or a timeout falls back to the old stable choice, so a deck is never held up. The choice is saved in the job checkpoint, so a retry never pays twice. Rewrites and remixes keep the deck's existing look.
**Light or dark follows the design** (`generation/theming.ts`): the topic still supplies the colours (greens for the environment …), but the design's own mode and background temperature are kept. Only an explicit "light" / "dark" request overrides it (`lightMode` / new `darkMode` in the analysis). *This replaces the earlier "AI decks are dark by default" rule.*
**Writing budgets** (`ai/prompts.ts`, instructions 2026-10-30.1): short titles, 3–5 points, ≤ 12 words each, so the larger type fits without shrinking.

## Result (same 537 stored decks re-composed with today's code; real-AI check on 5 new topics)
| | Before | After |
|---|---|---|
| Median body text | 30 px (15 pt) | **42 px (21 pt)** |
| Smallest body text | 22 px | **28 px** |
| Median heading / content title | 34 / 60 px | **40 / 68 px** |
| Tall text boxes filled | roadmap 23%, comparison 39% | **roadmap 52%, comparison 90%** |
| Text boxes overflowing | 0 | 0 |
| Real model, 5 topics (party, board security review, Romantic poetry lecture, fintech seed pitch, coffee launch) | one look | **5 different templates** (team-recognition, tech-security-review, education-lecture-notes, pitch-seed-round, marketing-social-spark), 4 light + 1 dark; suite 47 passes 8/8 on body size, one title size, no overflow, topic fit |

**No confetti** (2026-10-30): the party-popper ornament was removed from all 11 designs that used it (Sales Kickoff, Campaign Pop, Launch Day, Influencer Kit, Design Sprint, Engineering All-Hands, Classroom, Customer Win, All Hands, Offsite, Recognition); each now has a calmer ornament (soft circles, organic shapes, dots, blobs or rings). Old decks that already carry confetti still draw it (the style stays in the schema).

## How it is measured (re-runnable)
* `pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/type-audit.ts` — sizes per role, how far like text wanders, how full the tall boxes are, and the same stored contents re-composed with today's code (so before/after is like for like).
* `scripts/qa-deck-gallery.ts before|after|clean` — real stored decks on share links, to look at in a browser.
* `e2e/suites/47-deck-quality.mjs` — five different topics through the real model; proves different templates, light and dark both occur, type sizes, no overflow; saves screenshots.
* Unit: `theme` package (443 tests across every design × layout × aspect ratio), `design-pick.test.ts`, `theming.test.ts`.

## Limits and open items
* A scale cannot make thin content fill a slide: very short slides still have white space (that is normal design, not a bug).
* Dense layouts (matrix, roadmap in a square slide, architecture) can still need smaller type than the scale; they are flagged and shortened, not hidden.
* The template choice is only as good as the taglines of the 137 designs; if two designs of a category read alike the model may pick either.
* Per-word emphasis and manual per-slide font tweaks are untouched (users can still change any size in the editor).
