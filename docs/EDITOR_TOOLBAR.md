# Editor top toolbar and "Create from scratch"

Built 2026-10-31. The ribbon above the slide appears in **every** deck (AI-made, template or scratch).

| Button | What it does | Plan gate |
|---|---|---|
| Text | adds a text box, ready to type | advanced editor |
| Shapes | 6 basic + 46 library shapes (rectangles, arrows, stars, symbols, bubbles, banners) | advanced editor |
| Table | grid size picker; double-click a table (or Table → Edit selected table) to edit cells, rows, columns | advanced editor |
| Media | upload PNG/JPEG from the computer, open the Media library, or make a picture with AI | advanced editor |
| Chart | bar, line, pie, doughnut with sample data | advanced editor |
| Background | colour (hex, theme colours, standard colours, custom, opacity), upload image, Media library, gradients, remove | open to all |
| Undo / Redo / History | undo stack, version history | open to all |

**Media library** (tabs): Photos (Unsplash search, quick chips Gradient / Abstract / Data / Tech / 3D Shapes …; built-in gradients are free), My uploads (re-use or delete), Template photos (the pictures shipped with templates, free).
Pictures are copied to our storage; Unsplash is pinged on use (their terms) and the credit line is kept on the picture.

**Create from scratch**: `/scratch` (Home link + sidebar). Name, size (16:9, 4:3, 1:1), look (colours/fonts of a free design) → `POST /presentations {blank:true, templateId?}` makes one empty slide. No AI, no credits.

**Colours of the selected object** (bar above it): shapes get Fill (or Line colour) and Border colour + width, with "No fill"/"No border"; tables get Header, Header text, Rows, Alternate rows, Text and Borders colours and an "Edit cells" button. Unset = the deck's theme colours. Stored on the element, drawn on the canvas and used by the PPTX export.

## Server
`routes/editor-media.ts`: `POST /presentations/:id/images/upload` (magic-byte check, ≤ 8 MB, 300 kept pictures), `GET /media/mine`, `DELETE /media/mine/:id`, `GET /media/search` (shares the Unsplash hourly quota + per-user budget with deck generation), `GET /media/library`, `POST /presentations/:id/images/stock` (only images.unsplash.com / images.pexels.com).
Shapes: one outline list in `packages/validation/src/shapes.ts` draws the canvas (SVG), the menu previews, and the PPTX export (flattened to free-form shapes, holes kept).

## Tests
Unit: `toolbar-commands.test.ts`, `editor-media.test.ts`, `shapes-export.test.ts`, `scratch.test.ts`. Real browser: `e2e/suites/52-editor-toolbar.mjs` (19 checks; photo search answered by a stand-in so the shared Unsplash quota is not spent).

## Open decision
Adding objects is still behind `requireAdvanced` (Pro/Gold). Starter users on a scratch deck get the upgrade message for Text/Shapes/Table/Media/Chart; Background, Undo, Redo, History work. Recommended: open the advanced editor to all plans.
Background "opacity" is a lighter tint (slide backgrounds are solid colours).
