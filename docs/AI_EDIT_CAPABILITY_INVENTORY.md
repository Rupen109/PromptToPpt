# Edit with AI: capability inventory and plan (2026-11-21)

**Status: REVIEWED by the owner (2026-11-21); decisions in §18a. Fixed so far: F2, F4, F5, F6. Next: W0.** This adds to `docs/AI_EDIT_V3_ARCHITECTURE.md` (the architecture), using the owner's prompt list. It does not replace it.

**How this was made**
1. I drove the real editor in a browser on a copy of a real deck. Every toolbar menu, ribbon, panel, dialog and the More / slide menus were opened and screenshotted (57 screenshots).
2. Two code audits checked the schema, editor commands, routes and plan gates.
3. Every "exists" below cites the code. Nothing is assumed from a visible button.

**Legend**
- **Editor:** ✅ full (UI + command) · ⚙ in the document model but no UI (AI-only or unused) · ◐ partial · ❌ not built
- **AI today:** ✅ the assistant does it · ◐ partly · ❌ no
- **Phase:** see section 16. **W0** is the architecture foundation and comes before everything.

---

## 0. Findings from the editor walkthrough (real browser)

| # | Finding | Evidence |
|---|---|---|
| F1 | **Bold / italic / underline / link work on the whole text box only**, never on selected words. | `setRunFlag` commands.ts:134, `setLink` :155 |
| F2 | **FIXED 2026-11-21** (owner: Pro has no brand kits; one rule now). Was: **Pro plan bug:** Pro can create 1 brand kit, but the AI never sees it. The Pro plan has no `brandKit` flag, and the assistant loads the kit only when that flag is on. | kits.ts:12, billing/seed.ts:35, routes/presentations.ts:565 |
| F3 | **Present always starts at slide 1.** There is no start-from-current, and no presenter window. | PresentPage.tsx:19 |
| F4 | **FIXED 2026-11-21** (right-click menu). Was: **Bring to front / send to back has no UI.** Only forward/backward exist in the Selection pane. The AI can do front/back. | selection-commands.ts:29 |
| F5 | **FIXED 2026-11-21:** right-click menu on objects and on the empty slide. Was: **Right-click on an object shows no menu.** | screenshot 43 |
| F6 | **FIXED 2026-11-21:** inserts go to a free spot; new text boxes are empty with an editor-only prompt. Was: Clicking **Text** in the toolbar drops a "Type here" box on top of whatever is there (it landed on the photo), and it stays if left empty. | screenshots 02–07 |
| F7 | **Export is always the whole deck.** There is no "this slide as PNG". | lib/export.ts:66 |
| F8 | **Many properties are in the document but have no UI:** rotation, opacity, line height, letter spacing, paragraph spacing, vertical align, weight, uppercase, shape corner radius and gradient, picture fit / clip / overlay / radius, transition easing. | audit §Key gaps |
| F9 | Brand kits have **primary + accent + extra** colours (no "secondary"). A kit always applies to the **whole deck** (no per-slide apply). The AI can only use the **default kit** (cannot pick one by name). | brand/kits.ts:17, packages/theme/src/brand.ts:36, assistant/loaders.ts:17 |
| F10 | Comments attach to a **slide + optional pin**, never to an object. Collaborators are **editors only** (no viewer or commenter role). | schema.ts:802, collab/access.ts:10 |

---

## 1. Selection and layers
Editor: Selection pane (front-to-back list, rename by double-click/F2, hide/show, forward/backward), Shift-click multi-select, group/ungroup (Ctrl+G), lock per object (selection-commands.ts, SelectionPane.tsx).

| Prompt group | Editor | Command | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|---|
| "select all text boxes / images on slide 3 / the heading / the largest image / objects containing 'Revenue' / blue shapes" | ✅ multi-select | ui.ts selection | ❌ (AI reads the selection; never sets it) | `select` intent: resolve by type, role, text, colour or size **from real object ids**, then set the editor selection | — | W1 |
| "bring to front / send behind the image / one layer forward / backward / logo above everything / text above background shapes" | ✅ (Selection pane + right-click menu) | moveLayer selection-commands.ts:23-29 | ◐ front/back only | forward/backward, "behind X", "above all" | — | W1 |
| "group these / ungroup" | ✅ | groupElements commands.ts:272 | ✅ | — | — | done |
| "lock the background elements / unlock all objects" | ✅ per object | toggleLock :194 | ❌ | `lock_object` op (by type/role/all) | — | W1 |
| "rename this layer to Product Image" | ✅ | renameElement SC:9 | ❌ | `rename` op | — | W1 |
| "hide the selected object / show all hidden" | ✅ | setHidden SC:43 | ❌ | `hide` / `show` ops | — | W1 |
| "delete all unused decorative elements" | ◐ (delete exists) | deleteElements :184 | ◐ delete one object | delete by kind (decorative), with confirm when 3+ | — | W1 |

## 2. Text formatting
Editor: text bar has size ±, B/I/U, bullets/numbers, link, align L/C/R, colour swatches + picker, lock/duplicate/delete. Fonts are in Style → Fonts (PowerPoint-safe list).

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| text colour (box, role, slide, deck; "brand primary") | ✅ | ◐ (misses coloured words; capped at 60 objects) | every run + brand colour token; no cap | — | W0/W1 |
| size bigger / smaller / exact / "same size" | ✅ | ◐ ("increase" made it smaller) | relative-to-now + reflow | — | W0/W1 |
| bold / italic / underline whole box | ✅ | ◐ bold/italic only | underline | — | W1 |
| **only the selected words** bold / italic / underline / highlight | ❌ | ❌ | — | per-word formatting (F1) | W5 (editor first) |
| uppercase | ⚙ | ✅ | sentence case / title case (code transforms the words) | — | W1 |
| align left/centre/right | ✅ | ✅ | **justify** | justify (schema has no `justify`) | W1 / editor |
| vertical align in its box | ⚙ valign | ❌ | `valign` op | UI control | W1 |
| line spacing 1.5 / letter spacing / paragraph spacing / font weight | ⚙ lineHeight, letterSpacing, paraGap, weight | ❌ | ops for all four | UI controls (F8) | W1 |
| fit on one line / shrink to fit / no overflow / resize box to content | ◐ (validators detect overflow) | ❌ | fit op (size or box), checked by the overflow validator | — | W1 |
| text outline / text shadow / highlight colour | ❌ | ❌ (said "not yet") | — | schema + render + PPTX | W5 (editor first) |
| "same text formatting as slide 4" | ◐ | ❌ | format painter (copy run + box styles from one object to others) | — | W2 |
| bullets ↔ numbers ↔ none | ✅ | ❌ | `list` op | — | W1 |

## 3. Shapes
Editor: 51 shapes (rectangles, basics, common, symbols, arrows, callouts), fill, outline colour/width.

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| add shape (any of the 51) | ✅ | ◐ (11 kinds) | the full shape list | — | W2 |
| change shape kind ("rectangle → rounded / circle → oval / perfect circle") | ◐ (kind is a field) | ❌ | `shape_kind` + "perfect circle" = equal sides | — | W2 |
| fill / outline / width / remove border | ✅ | ✅ | — | — | done |
| corner radius | ⚙ | ✅ | — | UI | done |
| opacity | ⚙ | ✅ | — | UI | done |
| linear gradient | ⚙ | ✅ | — | UI | done |
| **dashed / dotted border, shape shadow, radial gradient** | ❌ | ❌ | — | schema + render + PPTX | W5 |
| **rotate 45° / flip** | ⚙ rotation, ❌ flip | ❌ | `rotate` op | rotate handle; flip in schema | W2 (rotate), W5 (flip) |
| same size as the other card / copy style / same shadow on all cards / equal spacing / three equal cards | ◐ (distribute exists) | ◐ (distribute, same font size) | `match_size`, `copy_style`, "N equal cards" (planned by code) | — | W2 |

## 4. Pictures
Editor: AI image, Remove background, Image URL, Crop (dialog with ratios), Picture panel (zoom, left/right, up/down, brightness, contrast, black and white, shadow).

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| crop to 16:9 / to a ratio | ✅ Crop dialog | ❌ (said "use Crop") | `crop` op with a ratio (centred, or focus left/right/top/bottom) | — | W2 |
| crop to focus on the coffee cup | ◐ | ❌ | a vision step finds the subject, then crop/zoom to it (owner: required) | — | W2 |
| fit inside / fill frame | ⚙ fit | ✅ | — | UI | done |
| circle / shapes / corners | ⚙ clip, radius | ✅ | — | UI | done |
| zoom / which part shows / brightness / contrast / B&W / shadow | ✅ | ✅ | — | — | done |
| darker / brighter | ✅ | ✅ | — | — | done |
| **warmer / saturation / blur / border / flip / rotate 90°** | ❌ (rotation ⚙) | ❌ | rotate op | filters, border, flip in schema + PPTX bake | W5 |
| replace keeping its size | ✅ | ◐ (stock/upload; inconsistent: sometimes proposes a paid AI picture) | one rule: free photo unless "generate" | — | W0 |
| same treatment on all product images / align all images | ◐ | ◐ (deck-wide picture_style) | "same as this one" (copy look); align by group | — | W2 |
| remove background | ✅ dev / Photoroom in production | ✅ (message bugs) | message fix | — | W0 |

## 5. Background
Editor: Background menu (colour, upload image, media library, 10 gradient presets, remove), slide-menu colours, Style → Colors (deck mode, slide background).

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| solid colour / brand primary as background | ✅ | ✅ colour | brand token | — | W1 |
| linear gradient | ✅ | ✅ | — | custom gradient UI | done |
| radial gradient / pattern / texture | ❌ | ❌ | — | schema + render + PPTX | W5 |
| image background (upload, library, stock, AI) | ✅ | ◐ (stock/AI) | from my uploads / library | — | W1 |
| darker / blur background image | ❌ on slide background (⚙ picture `overlay` on image objects) | ❌ | darken = overlay | background overlay/blur in schema | W2 / W5 |
| same background on all slides / per section | ✅ (Background → Use on this section / all slides, 2026-11-24) | ✅ all · ✅ sections (`{"by":"section"}` + `from`) | — | done | W2 / W5 |
| remove background image but keep colour | ✅ | ✅ | — | — | done |

## 6. Animations
Editor (verified in the ribbon): **Entrance** Appear, Fade In, Fly In, Zoom In, Float In, Wipe In, Split In, Rise Up, Bounce In, Pop In, Spin In, Grow & Turn · **Emphasis** Pulse, Grow/Shrink, Spin, Shake, Bounce, Color Change, Transparency, Teeter, Blink · **Exit** Disappear, Fade Out, Fly Out, Zoom Out, Float Out, Wipe Out, Shrink, Spin Out · **Paths** Line, Arc, Turn, Circle, Custom. Start (click / with / after), duration, delay, repeat (2/3/5/10/until end), easing (8), rewind, trigger (on click of object), earlier/later, Animation pane (drag order, duplicate, delete, play from), Painter, Add animation.

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| add entrance / emphasis / exit by name | ✅ all | ◐ 20 effects in the guide (missing Split In, Spin In, Grow & Turn, Color Change, Transparency, Teeter, Float Out, Shrink, Spin Out) | the full catalogue, generated from `motion-core` | — | W3 |
| one by one / by paragraph / word / letter | ✅ | ✅ | — | — | done |
| start, duration, delay, repeat, until end, easing, rewind | ✅ | ✅ (except rewind) | rewind | — | W3 |
| order: first / after the title / earlier / later / "title, then subtitle, then image, then stats" | ✅ | ◐ (one object at a time) | a whole sequence in one go | — | W3 |
| triggers | ✅ | ✅ | — | — | done |
| **Animation Painter**: copy from heading to other headings / to all product images / slide 3 → slide 4 | ✅ paintAnimation EC:156 | ❌ | `copy_animation` (object→objects, slide→slide) | — | W3 |
| remove entrance only, keep emphasis / remove the 3rd animation | ✅ | ◐ (remove all of an object's) | remove by kind / by position | — | W3 |
| make all start automatically | ✅ | ❌ | set start for all on a slide/deck | — | W3 |
| open/close Animation pane | ✅ | ❌ | UI action (opens the pane) | — | W4 |
| rename an animation | ❌ (rows show the object's name) | ❌ | rename the object instead (say so) | — | — |
| apply the same sequence to all slides | ✅ (painter) | ❌ | via copy_animation | — | W3 |

## 7. Transitions and Morph
Editor: None, Fade, Slide, Zoom, Push, Wipe, Morph (Gold+); duration 0.1–4 s; direction; on click / after N s; Apply to all; Remove Morph; Morph check (match objects across slides, duplicate for Morph, add scene). **Morph matches objects by the same id and type on neighbouring slides** (packages/ui/src/motion/morph.ts:6).

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| set type / direction / speed / auto-advance / all slides / one slide / remove | ✅ | ✅ (speed words, no exact duration) | exact duration ("1.2 s") | — | W3 |
| same as previous slide / consistent everywhere / subtle for corporate / dynamic for launch | ✅ | ◐ | style presets by intent | — | W3 |
| keep Morph, update others | ✅ | ◐ | rule in planner | — | W3 |
| **create a Morph sequence for slides 2–4 / keep the same product image across slides / move the product left → right / zoom Morph / title grows** | ✅ (duplicate for Morph, match objects, add scene) | ❌ | `morph_sequence`: duplicate or match objects by identity (same ids), then place them per the request, verified by `morph-check` | — | W3 |
| transition easing / blend | ✅ (Transitions ribbon, 2026-11-24) | ✅ | — | done | W5 |

## 8. Brand
Editor: Style → Brand: kit list, New kit, name, main + accent colour, extra swatches (read-only), heading/body fonts, logo upload/replace/remove, kit pictures, default kit, apply (colours / fonts / logo checkboxes), remove logo from every slide, brand from website / PPTX / PDF (also "use its slide layouts").

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| apply my saved brand (colours/fonts/logo, any part) | ✅ (Gold, Premium) | ◐ default kit only (Pro: no brand kits, by decision) | pick a kit by name | — | W4 |
| switch to my second brand | ✅ | ❌ | by name | — | W4 |
| brand from website / logo picture | ✅ | ✅ | from PPTX / PDF file | — | W4 |
| keep colours, take fonts from my brand | ✅ | ✅ (parts) | — | — | done |
| apply brand only to slides 1–5 | ✅ (Brand tab: Apply to slides, 2026-11-24) | ✅ `brand.slides` | — | done | W5 |
| **create / edit / delete a brand kit** (primary, accent, logo, fonts) | ✅ | ❌ | `brand_kit.*` intents, **separate from changing the deck**, always confirmed | — | W4 |
| secondary colour | ❌ (primary, accent, extra) | ❌ | map "secondary" → accent, say so | — | W4 |
| which slides break my brand / colours not in my palette / fix heading fonts / follow my typography | ◐ (review exists) | ❌ | brand review checks + fix | — | W4 |
| light and dark versions of my brand theme | ✅ (mode) | ◐ | — | — | W4 |
| create a theme from this kit | ✅ (Brand tab → Themes from your brand, 2026-11-24; Create page Look) | ✅ brand_kit `theme` (confirmed) + use by name | — | done | W5 |

## 9. Grid and alignment
Editor: snap to edges, centres and other objects with guides (Alt disables). **No layout grid, rulers, margins or user guides.**

| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| show/hide grid, snap to grid, align to grid | ❌ | ❌ | — | grid + snap-to-grid | W5 |
| align title with the left edge of the image / centre content / equal widths / equal gaps / distribute | ◐ | ◐ (align, distribute) | align to another object, equal widths, equal gaps | — | W2 |
| fix overlapping / nothing outside the slide / consistent margins / safe area | ◐ (validators) | ❌ | `tidy` op = quality guards applied as a fix | — | W2 |

## 10. Notes, comments, collaboration
| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| notes: write / shorter / full script / 30-second / 15-minute script / transitions between slides / cues | ✅ | ◐ (writes notes; wording bug "rewrote the text") | timing-aware script, labelled estimates | — | W1 |
| add a comment on this slide / at a spot | ✅ (slide + pin) | ❌ | `comment.add` (written as the person, labelled "by AI") | — | W4 |
| comment on the selected image | ✅ (Comment… on an object; the pin follows it, 2026-11-24) | ✅ `comment.on` | — | done | W4 |
| summarise comments / find unresolved / draft replies / resolve when done | ✅ APIs | ❌ | read + draft + resolve with confirm | — | W4 |
| summarise latest changes / since previous version | ◐ (versions) | ❌ | diff of versions → summary (Ask) | — | W4 |
| identify slides that need review | ✅ review | ✅ | — | — | done |

## 11. Present, Share, Export (workflow, not editing)
| Prompt group | Editor | AI today | Missing AI | Missing editor | Phase |
|---|---|---|---|---|---|
| start presenting (from slide 1) | ✅ | ❌ | UI action: open Present | — | W4 |
| present from the current slide | ❌ (F3) | ❌ | — | start-slide parameter | W4 |
| make a 5-minute version / presenter script | ✅ (reduce, notes) | ✅ | — | — | done |
| export PDF / PPTX / PNG / JPG / HTML | ✅ (owner, plan-gated) | ❌ (said "can't") | UI action: start the export (plan checked) | — | W4 |
| export only the current slide | ❌ (F7) | ❌ | — | single-slide export | W5 |
| check layout issues before export | ✅ review | ✅ | — | — | done |
| generate a share link / make view-only / password / expiry | ✅ (owner; plan-gated) | ❌ | **prepare only**: open Share with the choice filled; the person clicks | — | W4 |
| invite an editor | ✅ (owner, max 3/10) | ❌ | prepare only, the person confirms | — | W4 |
| editing for collaborators / view-only collaborator | ✅ editors · ✅ viewer role (view, present, comment; 2026-11-24) | ✅ invite `viewOnly` | — | done | later |

Rule: the AI never publishes a link, invites anyone or changes access on its own. It opens the right dialog, filled in, and the person confirms.

## 12. Charts and tables (not in the owner's list: added)
Editor: bar, line, pie, doughnut; data dialog (categories, series, values, unit); series colours, legend (auto/bottom/right/none), trend line, data labels. Tables: insert up to 6×8, edit cells, add/remove rows/columns, header/row/alt-row/text/border colours.

| Prompt | Editor | AI today | Missing | Phase |
|---|---|---|---|---|
| "add a bar chart of these numbers: …" | ✅ | ◐ (chart slide from text) | chart on the current slide from given numbers | W2 |
| "change it to a pie chart" / "sort high to low" / "set Q3 to 24" / "make a chart from this table" | ✅ | ✅ | — | done |
| "show the values on the bars" / "hide the legend" / "add a trend line" / "make series 1 green" | ✅ (chart dialog) | ❌ (refuses: "do it in Style") | ops for dataLabels, legend, trendline, series colour | W2 |
| "add a series / category" | ✅ | ❌ | ops (data from the person only) | W2 |
| stacked / area / scatter chart | ✅ (2026-11-24) | ✅ | — | done |
| table: add/remove rows/columns, edit a cell, sort, highlight max, ₹/%/1,000 formats, colours | ✅ | ✅ | — | done |
| table font size / merge cells / cell alignment | ⚙ fontSize · ✅ merge + cell alignment (table dialog, 2026-11-24) | ✅ merge (gridSpan/rowSpan) + alignment (algn/anchor) | fontSize op · ✅ `table_merge` · ✅ `table_align` | W2 / W5 (merge and cell alignment done 2026-11-24) |

## 13. Slides, layouts, templates, content (not in the owner's list: added)
| Prompt | Editor | AI today | Missing | Phase |
|---|---|---|---|---|
| add / delete / duplicate / move / swap / lock slides, sections, reduce, merge, split | ✅ | ✅ | — | done |
| "add thank-you slide in my theme" | ✅ | ◐ (look not checked) | design inheritance + check | W0 |
| "add 2 more points" / "5 points in the timeline" / "add more content" | ✅ | ❌ (false Done) | goal checks + capacity | W0 |
| change layout / "these 4 look the same" / redesign this slide (relayout) | ✅ relayout, ◐ changeLayout | ◐ | vary layouts; never empty placeholders | W0/W2 |
| change template / design / "more premium" / "minimalist" | ✅ | ◐ (can drop pictures) | keep pictures | W0 |
| dark / light mode, palette, accent, fonts | ✅ | ◐ | colour family kept | W0 |
| "use a picture from my media library" | ✅ | ◐ (uploads only) | library search | W1 |
| version history / "restore yesterday's version" / save a version | ✅ | ❌ (assistant undo only) | restore by time (confirmed) | W4 |
| "how many credits do I have" / "why can't I export PNG" | ✅ (plan data) | ◐ (help: plan) | answers from entitlements | W1 |

## 14. Ask vs Edit
Editor: the AI panel has **Edit** and **Ask** tabs. Ask (`POST /:id/ask`) is **read-only**, answers from the deck with "Slide N" buttons and a few credits, and is plan-gated (`askDeck`). Edit changes the deck.

| Need | Today | Change | Phase |
|---|---|---|---|
| Ask explains, reviews, recommends; never changes | ✅ | keep | done |
| recommendations in Ask (layout, colours, what is missing, inconsistent slides) | ◐ (answers from slide text) | add Deck Knowledge (design) so it can recommend design, not only content | W1 |
| "apply your recommendations" | ❌ | Ask returns its suggestions as structured items; a button "Apply in Edit" sends them as one Edit request (then the normal confirm, verify and undo) | W2 |
| an edit typed into Ask ("make it dark") | ? | Ask answers "That's a change: switch to Edit?" with a button that carries the message over | W1 |

## 15. Multi-step requests
"Premium Apple-style + my brand fonts + subtle animations + keep content", "redesign all slides…", "Morph between 2, 3 and 4 without changing content", "title first, then subtitle, then image, then stats". Today: 4 tasks per message, the rest offered as the next step. Needed: one **plan shown first** for big multi-part requests (what will change, cost), the parts as one undo step, and each part verified against its goal (W0 architecture). Phase: W2 (plan preview), using W0.

---

## 16. Phases (owner's priorities, on top of the v3 foundation)

| Phase | Content | Exit criteria |
|---|---|---|
| **W0 Foundation** (v3 architecture P1–P2) | goal-based "done when" checks, feasibility before acting, Deck Knowledge, design inheritance, reply rules, no silent caps | the 89-case live QA: zero false "Done", ≥95% done |
| **W1 (owner P0) Selection-aware editing** | select/resolve by type/role/text/colour/size; layers (forward/back/behind/above), lock, hide, rename; text: underline, valign, line/letter/paragraph spacing, weight, case, lists, fit/no overflow; brand colour tokens; media library pictures; Ask→Edit hand-off for typed edits | scenario + live cases per op; selected vs deck-wide; locked and Morph slides; undo/redo |
| **W2 (owner P1) Objects, pictures, backgrounds** | all 51 shapes, shape kind change, rotate, match size, copy style, equal cards/gaps/widths, align to another object, tidy (overlaps/margins); crop to ratio; copy picture look; background darken via overlay, per-section backgrounds; chart labels/legend/trend/series colour/add series; table font size; format painter; plan preview for multi-step; Ask "apply recommendations" | same |
| **W3 (owner P2) Animation and transitions** | full effect catalogue from `motion-core`; whole sequences; Animation Painter (object→objects, slide→slide); remove by kind/position; rewind; start-all; exact transition duration; transition style presets; **Morph sequences** (identity-preserving, verified by morph-check) | same, plus Morph cases on Gold and refusal on Pro |
| **W4 (owner P3/P4) Brand, collaboration, workflow** | brand kits by name, create/edit/delete kits (separate, confirmed), brand review + fix; comments (add, summarise, unresolved, draft replies, resolve with confirm); version summary/restore; Present / Export / Share as **UI actions with confirmation** | permission and plan tests; nothing published without the person's click |
| **W5 Editor features first (not AI work)** | per-word formatting, text shadow/outline/highlight, justify, dashed borders, shape shadow, radial gradient, flip, picture saturation/warmth/blur/border, background blur/pattern, layout grid + snap-to-grid, stacked charts, table merge, per-slide brand, single-slide export, present from slide N, element comments, viewer role, rotate handle, UI for the ⚙ fields | each built in the editor + PPTX export first; the AI op is added in the same change |

Every new capability follows the v3 rule: one catalogue entry (phrasings, done-when, limits, refusals) + an executor using the existing editor command + scenario tests (success, failure, selected and deck-wide scope, locked slide, Morph template, plan gate, undo/redo) + live cases. Nothing is listed as supported until its tests pass.

---

## 17. Prompts to add to the owner's list (missing from it)
The owner's list (sections 1–14) is kept as is. These are the additions, mostly from real users' chats and from features found in the editor:

**Content (the most common real requests)**
- "add more content in the 2nd slide" · "add more data please" · "add detailed info here" · "add the content from yourself"
- "add 2 more bullet points" · "add 2 more in both side" · "add 5 points total in timeline" · "remove the last point"
- "rewrite slide 7" · "edit the last slide content" · "please edit 11 number slide content" · "make slide 3 shorter"
- "translate slide 2 to Hindi" · "fix spelling and grammar" · "make it sound professional"

**Theme and colour**
- "make theme dark / light" · "make it dark again" · "make the dark theme of environment"
- "color should be brown" · "green color is not good, update it" · "change color of theme to environment color"
- "update the text color to off white / red" · "change the accent color to blue"

**Slides**
- "add thank you page (at last)" · "add 2 more slides" · "add 4 more slides in between" · "add a slide about X after slide 5"
- "change the background color of thank you page to same as other slides"
- "all 4 slides format is same, update the format" · "change slide 4 layout to two columns" · "make this slide less crowded"

**Pictures**
- "add a picture to the title slide" · "add images in the ppt" · "in the last slide please add image"
- "add best image in this first slide background related to …" · "image is not visible because of overlay, fix it"
- "update the shape of this image" · "make this image a circle"
- "remove the background from this coffee image, only the product"
- "use the picture from my media library" · "use my uploaded logo"

**Charts and tables**
- "change to pie chart" · "show values on the bars" · "hide the legend" · "add a trend line"
- "make series 1 green" · "set Q3 to 24" · "chart from this table"
- "add a row" · "sort by price" · "highlight the highest" · "show prices in ₹"

**Fonts**
- "change the fonts style" · "change fonts to professional" · "use Poppins"
- "font moneto" (an unknown font: it must say so)

**Conversation and complaints**
- "hii" · "bro" · "thanks"
- "didnt like it revert it please" · "you have changed the theme of whole ppt" · "why you changed the theme?"
- "thank you text is not visible" · "you have updates? cant see it"

**Plan and history**
- "how many credits do I have" · "why can't I export PNG"
- "restore the version from this morning" · "save a version"
- "duplicate this presentation" · "remix this presentation"

**Slide menu actions**
- "lock this slide"
- "slide colour orange" (the slide menu's colours)

**Ask mode**
- "summarise this deck in 3 bullets" · "what are the key numbers?"
- "which slide covers the next steps?" · "what questions might the audience ask?"

## 18a. Owner decisions (2026-11-21)
1. **Pro cannot use brand kits.** Built: one rule (`brandAllowed` / `assertBrand` in `services/api/src/brand/kits.ts`, the plan's `brandKit` feature) now decides kits, website/file brand, starting a deck with a kit and the assistant. Pro and Starter see no kits; a kit stored from an earlier plan is kept but unusable; deleting your own kit always works.
2. Share / Export / Present from chat: **open the dialog filled in, the person confirms.**
3. Saved brand kits from chat: **yes, strictly with a confirm step.**
4. AI comments: decided: written in the person's name with an "AI" label.
5. W5 order: decided: per-word formatting, front/back + rotate handle, present from slide N, single-slide export, line-spacing UI, flip, dashed border, picture warmth/saturation. (Front/back is already in the new right-click menu.)
6. **Crop to the subject ("focus on the coffee cup") is required**: a vision step finds the subject; planned in W2.
7. **F5 and F6 fixed:** right-click menu on objects and on the empty slide (one action module, `editor/object-actions.ts`, shared with the keyboard; adds Cut, Select all, front/back); every insert (toolbar and Insert menu, one command each) goes to the free spot nearest the middle (`freeSpot`/`bestSpot` in `packages/theme/src/assist/element-ops.ts`), and a new text box is empty with an editor-only prompt. Limit: on a slide with no free room at all it goes where it covers least, which can still be over part of a big title box.
Architecture decisions left to me (AI_EDIT_V3_ARCHITECTURE.md §12): unscoped "text colour" = whole deck; "add more content" without a document = general wording, never invented figures; "add a picture" = free stock photo unless the person says generate/AI; a request that can only be partly done = ask first; Hinglish phrasings from day one; Deck Knowledge token cost accepted.

## 18. Decisions
All answered: see §18a.
