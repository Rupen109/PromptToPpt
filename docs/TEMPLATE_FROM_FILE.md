# Template from an uploaded file ("same format, different data")

A person uploads a PowerPoint (.pptx) or a text PDF and says "I want this exact look, with different content". The **importer** (Part 1, built) reads the file and returns an
`UploadedTemplate`: its theme, every slide laid out in the editor's own document model, and the text boxes whose words can be replaced ("slots"). **Part 2** (create flow,
prompt-box control, AI fill, editor entry) consumes only that output. The PDF reader (section 7) produces the same `UploadedTemplate`; nothing in the types is
specific to .pptx.

Code: `services/api/src/template-import/`. Types: `types.ts`. Tests: `template-import.test.ts`, `store.test.ts`.

## 1. The contract Part 2 consumes

```ts
import { importPptxTemplate, parseTemplateFile } from '../template-import/index.ts'

const template: UploadedTemplate = await importPptxTemplate(buffer, { userId, filename })   // reads in the parse worker, stores pictures as the user's assets
```

* `importPptxTemplate(buffer, { userId, filename })` is the entry point a route will call. Throws `SourceError` (a sentence for the person; show it as it is) for a file that
  cannot be used (password protected, old `.ppt`, damaged, too big, not a presentation, a PDF of pictures or a portrait PDF: see section 7) and `BusyError` (parse-pool) when the workers are full (answer 503 "try again").
  Both come from the same pool and limits as every other upload (`sources/parse-pool.ts`).
* `parseTemplateFile(bytes, filename)` is the same without storing pictures (pictures come back as bytes, `src` is a pending address). `storeTemplatePictures(parsed, userId)` is the second half.
* Nothing calls a model, the network, or an image generator. No routes were added.

### `UploadedTemplate`

| field | meaning |
|---|---|
| `name` | file name without extension |
| `source` | `{ kind: 'pptx' \| 'pdf', filename, bytes }` |
| `theme` | an editor `Theme`: colours from the file's theme and master (background = what the first slide shows), heading/body fonts mapped to the nearest **supported** font, `style.footer = 'number'` when the file numbers its slides, `id = uploaded-<hash>`, `templateId = upload:<hash>` |
| `aspect`, `canvas` | `'16:9' \| '4:3' \| '1:1'` (nearest) and the canvas size. `canvas.fitted` = the file's shape was not exactly that ratio (16:10): it is scaled uniformly and centred, never stretched |
| `slides[]` | one per imported source slide (below) |
| `chrome[]` | text repeated on most slides or drawn by the master/layout (wordmark, section label, date, footer): `{ id, sample, maxChars, refs: [{ slide, elementId }] }`. Replace once for the whole deck, or keep |
| `fonts[]` | `{ original, mapped, replaced, role: 'heading'\|'body'\|'other', uses }`. Tell the user "Segoe UI was replaced by Inter" when `replaced` |
| `warnings[]` | deck-level notes (replaced fonts, charts/SmartArt, WordArt, 3-D, shadows, media, animations, notes, hidden/skipped slides, masters, fitted size, pictures that failed) |
| `stats` | `sourceSlides, importedSlides, skippedSlides, hiddenSlides, masters, elements, pictures, storedAssets` |

### `TemplateSlide`

| field | meaning |
|---|---|
| `n`, `name`, `layoutName` | position in the source file (hidden slides leave a gap), the title text (or `Slide n`), the source layout's name |
| `slide` | an **editor-ready `Slide`** (`layoutId: 'blank'`, `manual: true`, `ownLook: true`): background colour / gradient / picture, and every visible element in z-order (`zIndex` 1..n, ids `m*` master, `l*` layout, `e*` slide). Valid against `presentationSchema`; nothing new for the renderer, export or Present mode |
| `slots[]` | the text boxes whose words are the deck's own (below) |
| `decor[]` | element ids that are design: shapes, lines, non-replaceable pictures, master/layout items, repeated text, text with no words |
| `pictures[]` | `{ elementId, replaceable, kind: 'photo'\|'logo'\|'icon'\|'texture'\|'background'\|'masked', assetId?, width, height, coverage, inherited }` |
| `warnings[]` | per slide (deduplicated with counts) |

Tables and charts are in `slide.elements` but are neither slots nor decor (they hold data; Part 2 may fill them later).

### `TemplateSlot` (same shape as the Morph templates' `TemplateSlot`)

`{ id, elementId, role, sample, maxChars, maxLines, lines, detail, numeric, ticker: false }`

* `id === elementId`. `sample` is the file's own words: a guide to role and length, **never copy it into the new deck**.
* `maxChars` is the *room* like `textSlots().room` (box width and height, font size, heavy/capital type is wider); `maxLines` how many lines fit; `lines` how many paragraphs the sample has.
* `detail` (address, phone, e-mail, link, credit) and `numeric` (a figure) mean the same as in `generation/template-deck.ts`; `ticker` is always false.
* `role`: `title`, `subtitle`, `body`, `bullets`, `caption`, `number`, `label`, `name`, `other`.
* The slot is assignable to `generation/template-deck.ts`'s `TemplateSlot`, so `fitText`, `sanitizeFill`, `tooLong` and `stopgap` work on it unchanged (tested). To fill a slot, replace the text of `slide.elements[elementId]` keeping its first run's style (`paragraphs[0].runs[0]` carries colour/bold/italic; the element carries size, align, weight, spacing).

How slots are chosen: placeholders of type title / subtitle / body, plus text boxes and shape text with words. **Not** slots: footer, date and slide-number placeholders; text that is the same (digits ignored for small text) on ≥ 40 % of the slides (min 3); small repeated text near the bottom edge; text only drawn by the master or layout; text with no letters or digits.

## 2. What is kept, approximated, dropped

| source | result |
|---|---|
| Slide size | nearest 16:9 / 4:3 / 1:1, uniform scale, EMU → canvas px (2 px per point) |
| Theme colours, master colour map (dark masters), scheme-colour modifiers (lumMod/lumOff/tint/shade/satMod/alpha) | exact. `hueMod` is applied at half strength (matches PowerPoint's own rendering of the Office themes) |
| Theme fonts, run fonts | mapped to the nearest supported font; **`fonts.original` keeps the name**; "Light/Semibold/Black" in a name sets the weight. The editor has only two font slots (heading, body): text in the major font gets the heading role, everything else the body font |
| Background (slide → layout → master → theme style) | colour, 2-colour linear gradient exact. 3+ stops or radial gradients and theme picture backgrounds (with duotone recolour) are drawn once as a picture |
| Master and layout graphics | drawn under the slide, in order; "hide background graphics" honoured; group fill (`grpFill`) inherited |
| Placeholders | position, size, text style, insets, anchor, bullets, autofit inherited slide → layout → master → master text styles → presentation default; fill and outline too |
| Text | per-run bold / italic / underline / colour / link (http(s) only), per-paragraph bullets and numbers, alignment, anchor, line spacing, paragraph gap, letter spacing, caps, insets (taken off the box), autofit shrink (`fontScale`), no-wrap boxes widened, vertical text rotated |
| Text, **approximated** | one font size per text box (the size of most letters; a warning when a box mixes very different sizes), one alignment per box, bullet glyph from the first bullet (Wingdings mapped to • ▪ ✓ →), no indent levels, no bullet colour, no super/subscript |
| Pictures | cropped (`srcRect`), flipped, rotated, stretched to their box as PowerPoint does, circle / rounded masks, opacity; decoded under a pixel limit, re-encoded (PNG with transparency, else JPEG), metadata stripped, capped at 2400 px; stored as the user's assets, never hot-linked |
| Pictures, **dropped** | EMF / WMF / SVG-only / undecodable / linked (not embedded) pictures become the editor's "picture goes here" placeholder (or are left out) with a warning; recolour other than duotone, artistic effects, picture borders |
| Shapes | rectangles, rounded rectangles (exact radius), ellipse, triangle, ~40 presets as polygons or library shapes, arrows, chevrons, stars, donut (ring), lines/connectors (as a thin rotated rectangle), custom outlines (largest sub-path, ≤ 64 corners; a round outline with a round hole becomes a ring); fill solid / 2-colour gradient / none, outline colour and width, opacity (also from fill alpha), rotation, flips |
| Shapes, **approximated or dropped** | outlines on polygons are not drawn (the editor clips polygons); dashes drawn solid; arrowheads, shadows, glow, soft edges, 3-D, WordArt dropped (noted); gradients with 3+ stops on shapes use first and last colour; a glow that fades to nothing keeps its average strength as opacity; `arc`, `pie`, `chord`, braces are dropped; unknown presets become rectangles (warned) |
| Groups | flattened with exact nested transforms (scale, rotation, flips) |
| Tables | `table` element: header row, rows, header / row / band fills and text colours from the cells (or the accent colour for styled tables); > 8 columns or > 21 rows are cut (warned). The editor draws table text at its own size |
| Charts | bar, line, pie, doughnut as `chart` elements in the deck's colours (area → line, warned); others dropped (warned) |
| SmartArt | the drawing PowerPoint saves with it is imported as plain shapes; without it the SmartArt is left out (warned) |
| Embedded objects (OLE) | their preview picture; video/audio: poster picture only |
| Animations, transitions, speaker notes, comments, hyperlinks to slides | not imported (noted once) |
| Hidden slides | skipped with a note (their numbers leave a gap) |
| Slide numbers | removed from the slides; `theme.style.footer = 'number'` makes the viewer draw them |

Visual check against real PowerPoint: see section 5.

## 3. Limits and safety

* ≤ **80 slides** imported (the rest reported in `stats.skippedSlides` and a warning), ≤ **400 elements** per slide (smallest decoration dropped first, never words), file ≤ **15 MB** (the existing `PPTX_MAX_BYTES`), ≤ 100 pictures and ≤ 40 MB of stored pictures per import, ≤ 1,500 template pictures per person, ≤ 6,000 zip entries.
* Same zip protection as every upload (`sources/zip.ts` `readZip`): entry names chosen before inflating, declared sizes checked (per entry 12 MB for XML / 20 MB for a picture, total 80 MB XML / 160 MB pictures), real sizes checked after.
* XML: a linear-time reader (no regex backtracking) that **refuses `DOCTYPE` / `ENTITY` declarations** (entity bombs, XXE), decodes only the five standard entities and numeric references, never fetches anything, ≤ 400,000 nodes, ≤ 120 levels deep. External relationships are never followed (a linked picture is left out).
* Pictures: `sharp` with `limitInputPixels` 60 MP, sequential read, no animation, single thread; a decompression-bomb picture fails (tested) and becomes a placeholder.
* Runs in the **parse worker pool** (`sources/parse-pool.ts`: `parseTemplateUpload`): its own worker, memory limit (`SOURCE_PARSE_HEAP_MB`), time limit (`SOURCE_PARSE_TIMEOUT_MS`, the importer stops its own picture work after 20 s), queue and "busy" answer. A hostile file ends only its own worker. Development/tests start that worker through `parse-worker-dev.mjs` (tsx); the built `dist/parse-worker.js` bundles everything (verified with a real deck).
* Never emits an invalid element: every element is parsed with `elementSchema` (values clamped first: font size 4–600, opacity 0–1, finite numbers), anything that cannot be represented is dropped with a warning, and each slide is validated as a whole with `presentationSchema` (twice: before and after the picture addresses are swapped).
* Deterministic: same file → same template (ids, slots, picture references).
* Errors people can act on: password protected, old `.ppt`, Word/Excel renamed, damaged zip, too big, too many entries, "too large or complex" (worker out of memory), "took too long".

## 4. Risks Part 2 must handle

1. **Fonts.** The editor can only use its supported fonts. Calibri, Arial, Georgia, Verdana, Times New Roman, Helvetica are "supported" but are **system fonts**: on a computer without them (Linux, some Macs) the browser falls back and text can wrap differently. Replaced fonts are listed in `fonts` / `warnings`: show them. Different metrics mean a box can overflow: always run `fitText` / the room check on new text, and consider the box's `maxLines`.
2. **Autofit text.** The file's `fontScale` is baked into the size. New text that is longer shrinks nothing automatically; keep text within `maxChars` / `maxLines`.
3. **One size per box.** Boxes that mixed sizes (title + subtitle in one box) are shown at the main size; slots there hold both. Check `warnings` per slide and prefer boxes with one role.
4. **Charts and tables hold data** but are not slots. A new deck never keeps the old figures: charts stay in place with neutral sample data or the person's own figures (see "Charts in a new deck" in section 6); tables keep their shape with "Column n" / "Add text". Table text size is fixed by the editor.
5. **Pictures.** Replaceable pictures (`pictures[].replaceable`) are the sample deck's photos: keep, swap for stock (policy: Unsplash then own library, no AI images), or remove. A `replaceable: false` picture is design (logo, texture) and belongs to the template. Pictures stay the **uploader's** assets (kind `template`): sharing a template with other people needs copying them. Decks that are deleted leave their pictures behind (decide a clean-up rule).
6. **Copyright / privacy.** The sample words and pictures are somebody's content: never copy `sample` into the new deck, and do not show another person's template to anyone else.
7. **Slide numbers** come from the viewer (`theme.style.footer`), not from the elements.
8. **Master/layout text** (company name, tagline) is in `chrome`, not slots: ask once ("Replace Acme Corp with…") and edit the elements in `chrome[].refs`.
9. **Gradient / picture backgrounds** are pictures: changing the theme colour later will not recolour them.
10. **Only the first 80 slides** and **not hidden slides**: tell the user what was skipped (`stats`, `warnings`).
11. Importing is CPU/IO heavy (an 80-slide test deck with 14,500 elements and 81 pictures: ~6 s, +170 MB RSS in one worker). Rate-limit the route like other uploads and size the API task (≥ 1 GB, 2 GB advised, worker heap ≥ 512 MB).
12. `sharp` (native) is a new API dependency: the image must contain the binary for the target CPU (linux-arm64 on `t4g.small`).

## 5. How fidelity was verified

Every fixture was imported, drawn with the **editor's own renderer** (`SlideCanvas` from `packages/ui`, headless Chromium), and put beside PowerPoint's own export of the same file (PowerPoint for Mac driven by AppleScript, saved as PDF, rasterised with `unpdf`).

| fixture | made by | result |
|---|---|---|
| Facet, Ion, Circuit, Dividend, Berlin, Parcel, Gallery themes × title / title+content / two-content / title-only / four-object layouts, with shapes and a picture | real PowerPoint (`apply template` + layouts + placeholders) | positions, sizes, colours, z-order, master art and bullets match; see remaining differences below |
| nested, rotated and mirrored groups, rotated rounded rectangle with text, flipped lines, custom outline | hand-written XML injected into a PowerPoint-saved deck | matches pixel for pixel |
| pictures: full, cropped, corner-cropped, mirrored, rotated, circle mask, stretched | same | matches pixel for pixel (except the editor rounds nothing: `radius: 0` is set) |
| rich text (runs, bullets, line spacing, insets), autofit shrink, no-wrap, capitals, centred shape text, table | same | matches apart from the font itself; table rows are tighter and text smaller (editor table style) |
| 4:3 deck | PowerPoint blank 4:3 + injected shapes | matches |
| 16:10, pptxgenjs deck (master + slide number + footer), SmartArt drawing, charts, zip/XML/picture bombs | built in code | unit tests only (PowerPoint was not asked to draw these) |

Remaining visible differences: (1) fonts (substitutes are wider or heavier than Century Gothic, Gill Sans, Tw Cen MT, Trebuchet; PowerPoint's own font is not available in the browser); (2) outlines on polygon shapes (arrows, chevrons, triangles) are not drawn; (3) theme gradients with large `hueMod` / `satMod` values land close to, not exactly on, PowerPoint's colours (Berlin: orange-to-brown instead of orange-to-maroon); (4) bullet colour and size follow the text; (5) real tables are drawn in the editor's table style; (6) glows and shadows are dropped.


## 6. Part 2: the feature (create flow, API, editor)

Built 2026-11-13. A person picks "Use a file's design (same format)" in the Home prompt box, uploads a .pptx (or picks an earlier upload) and gets a new deck in that file's exact look.

### Data flow
```
Home prompt box --upload--> POST /api/v1/file-templates --importTemplateFile--> parse worker --> UploadedTemplate --> table user_template (data jsonb)
Home chip -> /create (pending template in sessionStorage) -> "Write it for me" | "I'll add the data myself" + slide count
  -> POST /api/v1/generation/jobs { fromTemplateId, templateMode: 'ai' | 'manual', slideCount? }
  -> startDeckJob: gate (assertTemplateFromFile) -> owner check -> option conflicts -> slide count -> quota -> credits -> the deck is created at once with the file's theme
  -> pipeline.generate -> generation/from-template.ts runFileTemplateDeck -> generation/uploaded-template.ts (pure) -> writeDeck (same open-early writer as every path)
Editor "New slide" menu -> GET /file-templates/:id/layouts (placeholders) -> insert slide
```

### Server pieces
| file | what |
|---|---|
| `db/schema.ts` `userTemplate`, migration 0044 | `user_template(id, user_id FK cascade, name, source_filename, aspect, slide_count, data jsonb, created_at)`; index on (user, created_at) |
| migration 0045 | plan flag `templateFromFile` (Pro/Gold/Premium on) |
| `template-import/importers.ts` | the registry of readers by file kind (`pptx`, `pdf`), `detectKind`, `importTemplateFile` |
| `template-import/user-templates.ts` | `saveUserTemplate`, `getUserTemplate`, `listUserTemplates` (first slide only, via SQL JSON path), `deleteUserTemplate`, `assertTemplateRoom` (cap `MAX_USER_TEMPLATES` = 20), `summaryOf` |
| `routes/file-templates.ts` | `POST /` (6 a minute, plan + cap checked BEFORE the body is read, then `uploadGate`, 15 MB body limit, maintenance flag), `GET /`, `GET /:id` (summary, theme, slides), `GET /:id/layouts` (placeholder slides), `DELETE /:id`. Everything is scoped to the signed-in person (another person's id is a 404) |
| `generation/start.ts` | options `fromTemplateId`, `templateMode`; refuses remix, rewrite, picturesOnly, Morph, Morph template, designId, brandKitId with a 400 `INVALID_REQUEST`; slide count = the person's number, else the file's own, capped by the plan; manual mode reserves 0 credits |
| `generation/uploaded-template.ts` | pure: `classifySlides`, `describeSlides`, `assignSlides`, `alignFill`, `buildDeck`, `layoutSlide`, `placeholderFor` |
| `generation/from-template.ts` | the job: manual (no model) or AI (analysis, ONE call that chooses slides and writes words, at most one shorten repair, pictures) |
| `ai/prompts.ts` `fileTemplateFillPrompt`, `ai/mock-model.ts` `[task:file_template_fill]` | the single writing call; ledger type `outline_generation` (analysis `prompt_analysis`) |

### Charts in a new deck
Every chart of the chosen template slide stays: same type (bar, line, pie, doughnut), position, size and the deck's theme colours. Its DATA is always replaced, never the file's labels, series names, figures or unit.
* **AI mode, request/sources contain figures** (`allowNumeric`): the single fill call also returns `charts: { <chart id>: { labels, series: [{ name, values }], unit? } }` per chart slot (the model is told each chart's id, type, category/series counts and label room). `chartData()` accepts it only if every value (and any number in a label, series name or unit) is a number the person supplied (`allowedNumbers` / `numberTokens` from `quality.ts`; with or without %, k, m, b, x; labels may carry a bare small integer like "Q3"), values are finite, each series has one value per label, pie/doughnut use one series, counts fit the schema (24 labels, 6 series); labels are fitted to the chart's label room. Anything else makes that chart fall back to sample data.
* **Otherwise** (no figures given, manual mode, invalid proposal, "From your template" menu): `placeholderChart()` = labels "Item 1…N" (3-8, from the original's count), series "Series 1…k", gently stepped made-up values (10, 20, 30… for a pie; 20, 30, 40… for bars and lines), `unit` removed, and `placeholder: true` (additive optional field of the chart element in `packages/validation`; old decks are unaffected).
* **The cue**: a chart with `placeholder: true` shows "Sample data — edit this chart" in the editor stage only (an overlay of `EditorCanvas`, not part of `SlideCanvas`, so thumbnails, Present, shared view and PPTX/PDF/PNG exports draw an ordinary chart). Clicking it, double-clicking the chart, or "Edit data" in the format bar opens `ChartDialog` (categories, series, values, unit); **Done** clears the flag.
* The job report counts `chartsKept` and `chartsPlaceholder`.

### Options and rules
* **Gate**: `features.templateFromFile`, one value per plan, default Pro/Gold/Premium on, Starter off. Enforced on upload and on every job start.
* **Slide choice** (the model proposes, code decides): cover = the first slide (a title-like slide), closing = the last when the file has one (named like one or a short last slide), middle slides use only the other slides, never an unknown index, never the same slide twice in a row when another exists, at most 2 uses (3-10 slide decks) or `ceil(middle / pool)` uses when the file is smaller than the deck (even repeats). No usable proposal: the file's own order (or an even spread). When a choice is overridden the model's words for that position are carried over by role (`alignFill`).
* **Words**: AI mode writes only the text slots (`sanitizeFill`: figures only if the request gave them, detail and numeric boxes empty otherwise, `fitText` to `maxChars`, then a fit loop with the deck validator's own text measure until the box holds it); a box the model skipped gets a short stand-in from the deck title, never the sample. Manual mode puts a role placeholder ("Add your title", "Add a point", "0" for a figure box) in every slot. The file's sample words are never copied anywhere (the model is told roles and lengths only).
* **Repeated labels (chrome)**: AI mode: the model writes them once for the whole deck ("" removes the label). Manual mode: kept as the file drew them (it is the person's own design text).
* **Pictures**: design pictures (logos, textures, masters) stay. Replaceable photos: AI mode looks up topic pictures with the normal picture session (Unsplash, then the tagged library, vision check; no AI images; at most 12 per deck), the words show first and the pictures follow; no match = the editor's "picture goes here" box; manual mode = "picture goes here" boxes. The uploader's own photo never ships in a new deck. Backgrounds that are pictures stay (they are design).
* **Charts and tables** hold the original's figures: tables keep their shape with "Column n" / "Add text" cells; charts are KEPT with new data (below).
* **Ids**: every element id is `<slide id>:<template element id>`, so writing the same slide again keeps ids (the open-early merge needs this).
* **Language**: the deck language by the usual rules (analysis / picker); the template's own words are not translated, they are replaced.
* **Slides are copies**: the deck is `manual` + `ownLook` slides with the template's theme; it exports (PPTX, PDF, PNG, HTML) like any deck.

### Storage of layouts: fetched, not copied into the deck (decision)
The deck stores only `templateId` (additive optional field, `packages/validation/src/presentation.ts`). The editor's "From your template" menu fetches `GET /file-templates/:id/layouts` when the menu opens. Reason: a design can be up to 80 slides and several MB; copying it into every deck would make every save, version and share heavier. The cost: if the design is deleted the menu section simply hides (404 is handled); the deck itself holds its own slides and is unaffected. Deleting a design does not delete its pictures (decks made from it may still show them). Inserting a slide is an ordinary document edit, not a gated action (a person on a lower plan can still use layouts of a design they already have).

### Limits
20 designs per person; 1,500 template pictures per person (existing); 15 MB per file; 6 uploads a minute; 2 running jobs and 10 job starts a minute per person (existing). PDF: same limits (15 MB, 80 pages).

### Tests
`services/api/src/generation/from-template.test.ts` (mock AI: gate, routes, isolation, cap, rate limit, option conflicts, slide choice, manual and AI decks, ids, saving, deleting, quota) and `e2e/suites/69-deck-from-file-design.mjs` (real browser and model).

## 7. PDF as a design

Built 2026-11-17. `template-import/parse-pdf.ts` (+ `pdf-ops.ts`, `pdf-text.ts`) returns the same `UploadedTemplate`; the parse worker (`sources/parse-worker.ts`, `parse-pool.ts`) picks it by the file's first bytes (`%PDF`), so routes, the plan gate, storage, picker, create flow, AI/manual fill and "From your template" are unchanged. `source.kind = 'pdf'`, `masters = 0`, `layoutName = "PDF page n"`.

A PDF has no layouts, placeholders or text boxes. Each PAGE is rebuilt from what pdf.js says it draws (its operator list; nothing is rendered, so a page costs milliseconds).

| from the PDF | result |
|---|---|
| page size | first page picks 16:9 / 4:3 / 1:1 (nearest; other page sizes are scaled uniformly and centred, warned). **Portrait documents (A4/Letter) are refused**: the editor's canvas is landscape-or-square only, so a letter would be a tiny strip. A portrait page inside a landscape deck is skipped with a note |
| background | the first page-sized fill = background colour (or 2-colour gradient, angle from the shading); a page-sized picture behind the words = the slide's background picture; shapes drawn under it are dropped |
| text | pieces -> lines (same baseline, letter-spaced words rejoined) -> paragraphs (same size, left edge or centre, colour, weight, tight pitch) -> boxes (bullet lists, paragraph gaps). Size in canvas px, weight (name hints and bold flag), italic, colour, alignment, line height from the pitch, paragraph gap, letter spacing, rotation, per-run bold/italic/colour |
| bullets and numbers | a marker glyph that starts a line, or a small dot/square drawn as a shape left of it (browsers draw bullets as shapes) = `list: bullet/number`, the marker is not kept as a shape |
| shapes | filled / stroked rectangles, rotated rectangles, rounded rectangles (radius), ellipses, rings, lines (as thin rectangles), polygons up to 64 corners; solid or 2-colour gradient fill, opacity, outline on rect/ellipse; compound paths are split per sub-path; page clips (a picture's frame) cut rectangles |
| pictures | decoded by pdf.js, cropped to their clip, flipped / rotated, rounded or circular frames, re-encoded by the pptx pipeline's rules (sharp, JPEG or PNG with alpha, <= 2400 px, metadata stripped), stored as the user's `template` assets, same classification (replaceable photo, logo, texture) |
| fonts | `ABCDEF+Aptos-Bold` -> family `Aptos` -> `mapFont` (same table as .pptx): `fonts[]` records original / mapped / replaced. Two theme slots only: heading = the font most often used by the biggest text of a page, body = most letters |
| theme | background, text colours (by letters), primary / secondary / accent from the largest saturated fills and coloured text, surface from card fills |
| slots, chrome, decor, pictures | the `.pptx` rules (`slots.ts`): repeated labels = chrome, repeated small bottom text, titles, bullets, numbers, details. Page numbers (a number alone near the page edge on half the pages) are removed and `theme.style.footer = 'number'` |

**Refused (with a sentence for the person)**: a PDF whose pages are only pictures (a scan, slides saved one JPEG per page such as SlidesDone's own PDF export, or an OCR'd scan: the invisible text layer is ignored on purpose): "...pictures..., upload the .pptx or export a text PDF from PowerPoint, Google Slides or Canva"; a portrait document; a password-protected PDF; a damaged file; more than 200 pages. When SOME pages are pictures or empty the text pages are imported and the rest is listed in `warnings`. The free tool's decryptor (owner password, empty user password) is not used here: such a file is refused as protected.

**Approximated or not kept**: line breaks are recomputed by the editor with the substitute font (the box is a little wider than the PDF's widest line so words do not jump); text in several fonts shows in the two theme fonts; tables, charts and SmartArt are plain text + shapes (a PDF chart is not a `chart` element, so it keeps the old figures as drawing: a PDF holding another person's chart data keeps it as shapes and words in the template, the generated deck replaces the words but cannot replace drawn bars); soft shadows, blurs, fades and pattern fills are dropped (noted); outlines on polygons; stencil icons; links, annotations, forms, bookmarks; embedded fonts (not used).

**Limits and safety**: same worker pool, memory and time as .pptx (`PDF_TIME_BUDGET_MS` 20 s: remaining pages are skipped with a note); <= 80 pages imported (<= 200 pages in the file), <= 400 elements per page (smallest decoration first, never words); per page <= 600,000 operators, 6,000 shapes, 8,000 text pieces, 120 pictures, 4,000 path points per shape; pdf.js `maxImageSize` 36 MP, `isEvalSupported: false`; pictures <= 100 and 40 MB per import. Hostile test: a picture declared 40000 x 40000 px and 1,500 shapes read in about a second, the picture left out.

**Verified against real producers** (rendered with the editor, beside the PDF drawn by pdf.js): PowerPoint for Mac (`save as PDF` through AppleScript; Aptos/Georgia/Calibri decks, gradients, a picture background, tables, a bar chart, 4:3), Chrome (Skia: CSS gradient, rounded SVG picture, bullets as shapes, letter-spaced caps, soft shadow). Remaining visible differences: the substitute font is wider (Inter vs Aptos: a card text can wrap one line more), picture-page and chart/table items as above, bullet glyph size, a small gradient start-colour difference.

### Charts in the PDF path
Because a PDF chart is vector drawing, there is no chart data to keep or replace: see "Approximated" above. If the owner wants charts from PDFs the only honest route is to ask for the .pptx.

