# QA report — landing → prompt → editor → export

Run: `pnpm e2e` (141 checks, 9 suites, ~9 min incl. real AI calls). Plan: `docs/QA_PLAN.md`. Status at the end of this pass: **141 / 141 green**, unit tests green (theme 325, api 176, editor 26).

## Defects found and fixed
| Sev | Area | Defect | Fix |
|---|---|---|---|
| S1 | Export | Export returned 501 for every format | PPTX built server-side (pptxgenjs: editable text, native charts/tables, embedded pictures, notes, gradients, 3 aspect ratios); PDF / PNG / JPG / HTML rendered in the browser after the server authorises the plan; plan gate unchanged and server-side |
| S2 | Editor | Invisible hit-boxes of background decorations overhung the canvas and swallowed clicks on the page below (e.g. "Speaker notes") | decorative elements get no hit-box; overhanging hit-boxes are clipped to the slide |
| S2 | Editor | Export menu never closed on Esc / outside click | closes on both |
| S2 | Website | Mobile layout broken: 456 px horizontal overflow on `/`, 1530 px on template pages, no mobile nav | responsive simulator, template page grid, new hamburger menu |
| S2 | Editor | Dead controls: "Let AI decide", Starred/Downloads/Recently-deleted tabs, Share, Brand-kit, "COMING SOON" slide-menu items | removed (features not built); Home shows "Recent presentations" |
| S2 | Template page | Whole preview jumped on every slide change (height collapsed while the slide remounted) | `FitSlide` reserves its aspect-ratio height |
| S2 | Accessibility | Contrast failures (orange CTA 3.0:1, slate-400 text, red chip, faded list items…); breadcrumb link not distinguishable | accent deepened to #cf3f0d (4.8:1), text colours raised; axe serious+critical = 0 on every public + app page |
| S3 | Website | `/pricing` had no `<h1>` | h1 |
| S3 | Library | Deck cards showed an empty box | real first-slide thumbnails (API returns first slide + theme) |
| S3 | Export | Download file name lost (CORS), fonts not embedded in PNG/PDF | `Content-Disposition` exposed; font stylesheets loaded with `crossorigin` |
| S3 | Templates | Photo slides ignored the design's colours (dark cover on a light deck) | photo slides use the design's own ground + text colours |

## Known limits (not defects of this pass)
- PPTX does not carry entrance animations/transitions, diagonal / arch picture crops (plain rectangles) or the live footer; fonts must be installed on the viewing machine.
- Not built (controls removed rather than left dead): share links, brand kit, starred / recently deleted, owner sections listed as "COMING".
- Not automated: completing a Razorpay payment (verified manually earlier; the suite checks checkout opens, forged signatures and unsigned webhooks are refused), Google sign-in round-trip, Safari / Firefox.
- Template photography for some categories is still being generated (quota ≈ 1 image / min); missing pictures 404 until the job finishes.
