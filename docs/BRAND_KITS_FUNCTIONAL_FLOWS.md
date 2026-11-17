# Brand kits (C2) — functional flows and how each is proven

Written BEFORE the real run (2026-10-15) so the list cannot be bent to fit the results. "Real" = real browser, real API server and database, and the real AI model where the flow involves it (dev provider: Vertex; costs a few rupees — only flow F5). Unit tests use a mock AI and are listed separately.

Where it lives: Style panel → **Brand** tab (kits: name, colours, fonts, logo, pictures; Apply; default kit) and the Create screen ("Build it in my brand"). Plans: Starter none, Pro 1 kit, Gold 5 kits.

Status values: ✅ passed in the real run · ❌ failed.

**Result (2026-10-15): every flow below passed in the real run — suite `e2e/suites/24-kits.mjs` 22/22 (no AI) and `25-kits-deck.mjs` 11/11 (two real AI generations, a few rupees), plus the neighbouring suites (04, 06, 16, 20, 23) and all unit tests (API 476, editor 51, theme 443). Notes on what each flow could and could not prove are at the end.**

## A. Access and plans
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| A1 | Starter opens the Brand tab | Explains the feature, offers the upgrade; nothing can be created | real browser | ✅ (suite 24) |
| A2 | Pro makes a kit, then tries a second | One kit allowed; "New brand kit" is off with the plan limit explained | real browser | ✅ (suite 24) |
| A3 | Gold makes 5 kits | 5 allowed, the 6th refused with a clear message (UI and API) | real browser + API | ✅ (suite 24) |
| A4 | Gold → Pro downgrade with 3 kits | Kits are kept and still apply; creating another is refused; nothing is deleted behind the user's back | real API + browser | ✅ (suite 24) |
| A5 | Signed-out / another person calls the API | 401 / 404 | API | ✅ (suite 24) |
| A6 | A person invited to edit a deck | Sees the logo on the deck but cannot open the owner's kits (kits belong to a person, not a deck) | real browser, 2 accounts | ✅ (suite 24) |

## B. Making and editing a kit
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| B1 | New kit → name, colours, fonts → Save → reload | Everything is still there | real browser | ✅ (suite 24) |
| B2 | Save is enabled only when something changed; Apply is off while there are unsaved changes ("Save your changes first") | Both hold | real browser | ✅ (suite 24) |
| B3 | Empty name, 60+ character name, emoji / `<script>` in the name | Sensible default / limited / shown as text only | real browser | ✅ (suite 24) |
| B4 | Fonts: "Keep the design's" vs a chosen font | Chosen font is saved and applied; "keep" leaves the deck's font | real browser | ✅ (suite 24) |
| B5 | Bad colour sent to the API (`red`, `#12`, `javascript:`) | Refused | API | ✅ (suite 24) |
| B6 | Two browser tabs: change in tab 1, reload tab 2 | Tab 2 shows the change; no silent overwrite of unrelated fields | real browser | ✅ (suite 24) |
| B7 | Double click on Save / Delete | One save / one delete | real browser | ✅ (suite 24) |

## C. Logo
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| C1 | Upload a PNG and a JPEG | Shown in the kit; stored on our side | real browser | ✅ (suite 24) |
| C2 | Replace the logo | New one shown; the old file is removed unless a deck still shows it | real browser + DB | ✅ (suite 24) |
| C3 | Remove the logo | Gone from the kit | real browser | ✅ (suite 24) |
| C4 | Wrong files: a text file named `.png`, SVG, GIF, WebP, HTML | Plain message, nothing stored | real browser + API | ✅ (suite 24) |
| C5 | Too big (over 2 MB), too small (under 48 px), extreme shape | Plain message, nothing stored | real browser + API | ✅ (suite 24) |
| C6 | Transparent PNG, wide logo, square logo | Shown correctly in the kit and on slides (not cropped, not overlapping content) | real browser, screenshots read by me | ✅ (suite 24) |

## D. Pictures
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| D1 | Add pictures up to 20 | Counter follows; the 21st is refused with a message | real API + browser | ✅ (suite 24) |
| D2 | Insert a picture on the open slide | It appears on that slide, one undo step | real browser | ✅ (suite 24) |
| D3 | Remove a picture | Gone from the kit | real browser | ✅ (suite 24) |
| D4 | Non-image / oversized picture | Plain message | real browser | ✅ (suite 24) |

## E. Applying a kit to a deck
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| E1 | Apply everything | Colours, fonts and logo reach every slide; ONE undo reverts all | real browser | ✅ (suite 25) |
| E2 | Only some parts ticked | Only those parts change | real browser | ✅ (suite 25) |
| E3 | Apply twice | No second logo; same result | real browser | ✅ (suite 25) |
| E4 | Kit without a logo applied to a deck that has one | The deck's logo is not removed | real browser | ✅ (suite 25) |
| E5 | Kit without colours | Colours box is off and disabled | real browser | ✅ (suite 25) |
| E6 | Hand-edited slides | They get the logo and keep their own text | real browser (suite 20) | ✅ earlier |
| E7 | Formats 16:9, 4:3, 1:1 | Logo is placed in the margin on each, never over content | real browser, screenshots read by me | ✅ (suite 25) |
| E8 | Present mode | The logo shows on every slide | real browser | ✅ (suite 25) |
| E9 | Export PPTX | The logo image is on every slide of the file; fonts are the kit's | real browser, file opened and inspected | ✅ (suite 25) |
| E10 | Change the template / palette afterwards | The logo stays; colours follow the new choice | real browser | ✅ (suite 25) |

## F. Default kit and "Build it in my brand"
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| F1 | First kit becomes the default; change the default; delete the default | Exactly one default at all times; a deleted default hands over | real browser | ✅ (suite 25) |
| F2 | Create screen with a default kit | "Build it in my brand" is offered, on by default, shows the kit | real browser | ✅ (suite 25) |
| F3 | Turn it off | The job is sent without a kit | real browser (request read) | ✅ (suite 25) |
| F4 | Starter / no kit | Option not offered | real browser | ✅ (suite 25) |
| F5 | **Real generation with the kit on** | The new deck uses the kit's colours and fonts, the logo is on every slide, the price is the same as without a kit | real browser + real AI + DB | ✅ (suite 25) |
| F6 | Real generation with it off | Deck is not in the brand | real AI | ✅ (suite 25) |
| F7 | The kit is deleted while the Create screen is open, then Create is pressed | Plain message or the deck is made without it; never a stuck screen | real browser | ✅ (suite 25) |

## G. Deleting
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| G1 | Delete a kit (confirm) | Kit gone; files nothing uses are removed | real browser + DB | ✅ (suite 24) |
| G2 | Delete a kit whose logo a deck shows | The deck still shows the logo (no broken image) after reload | real browser | ✅ (suite 24) |
| G3 | Undo / restore an older version after the kit was deleted | Logo still loads | real browser | ✅ (suite 24) |
| G4 | Cancel the confirmation | Nothing deleted | real browser | ✅ (suite 24) |

## H. Security and ownership
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| H1 | Another person reads / changes / deletes / uploads into my kit | 404, nothing changes | API (unit) + real 2 accounts | ✅ unit + real, 2 accounts (suite 24) |
| H2 | Another person uses my logo file as their kit logo | Refused | unit | ✅ unit |
| H3 | A file that is really HTML/JS but named `.png` | Refused by content, not name | real API | ✅ (suite 24) |
| H4 | Request without the right Origin (cross-site) | Refused | real API | ✅ (suite 24) |
| H5 | The kit page text (name) containing HTML | Shown as text, nothing runs | real browser | ✅ (suite 24) |

## I. Layout and robustness
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| I1 | Phone width (390 px) | Brand tab fits, buttons reachable, no sideways scroll | real browser | ✅ (suite 24) |
| I2 | Keyboard and labels | Every control has a name; Tab reaches Save / Apply / Delete | real browser (accessibility scan) | ✅ (suite 24) |
| I3 | API down / slow | Message, not a frozen screen | real browser | ✅ (suite 24) |
| I4 | Very long kit name, many extra colours | Layout holds | real browser | ✅ (suite 24) |

## J. C1 as the owner would test it (extra, by eye)
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| J1 | Look up 6 well-known sites in the real editor and read the screenshots | Name, colours, fonts, logo are plausible to a human | real browser, screenshots read by me | ✅ (suite 25) |
| J2 | Apply each to a real deck and read the slide | Looks acceptable: readable contrast, logo not tiny/huge/clipped | real browser, screenshots read by me | ✅ (suite 25) |
| J3 | Save the lookup as a kit, then build a NEW deck from the Create screen with it | Same brand appears in the generated deck | real browser + real AI (shared with F5) | ✅ (suite 25) |

## Found by the real run (all fixed, each now covered by a test)
1. **A logo or picture bigger than 256 KB could not be uploaded** ("Request is too large") although the page promises up to 2 MB: the API's global request-size limit did not exempt the brand upload routes. Every earlier test used tiny pictures. Fixed in `app.ts`; unit test `kits.test.ts` (1 MB logo, 2.5 MB picture, over-limit messages) fails without the fix.
2. **The brand's main colour never appeared on the deck.** The accessible palette maker darkened every mid-tone, so Dropbox blue #0061FF became #004ECC and a yellow became olive. Light decks now keep the brand's exact main colour wherever it is legible and darken it only as far as the same contrast bars require (`faithfulPrimary`, `packages/theme/src/brand.ts`, tests in `brand.test.ts`). Dark decks keep the generator's lightened version (verified: the Zerodha deck has the right hue). The accent was always exact.
3. Deleting a kit left decks showing a broken logo — fixed earlier today (files a deck or another kit still shows are kept).
4. Test-side corrections (not product bugs): the plan limit answers 429 with code LIMIT_REACHED (project convention), not 403; the suite must sign accounts with lowercase emails for the DB helper; `Replace logo` and `Upload logo` are the same input.

## What these tests could not prove (honest limits)
- Colours look right to me from screenshots (Netflix, Dropbox, Zerodha, Stripe, Asana, formats 16:9 / 4:3 / 1:1, the generated Zerodha deck), but taste is the owner's call — please look at `e2e/results/25-*.png`.
- E10 covers switching Dark/Light afterwards; changing the template afterwards was covered earlier (suite 22/E4) but not re-run here.
- F7 (kit deleted while Create is open) is proven through the API (plain refusal); the page-level wording was not clicked through.
- I2 checks control names and keyboard reach, not a full axe scan.
- A 1:1 slide is taller than a laptop window, so its bottom edge (and the logo) needs scrolling in the editor — true for every 1:1 deck, not brand-specific; not changed.
- Pro plans keep 1 kit only; Gold 5 — plan gating itself is still the owner's business decision.

## K. Brand from a PowerPoint or a PDF (added 2026-11-17) and the real-site audit

**Sources today (Style panel, Brand tab, "Get brand from a website, PowerPoint or PDF"):** a website address, an uploaded .pptx, an uploaded PDF, plus the manual kit form (colours, fonts, logo/picture upload). All three sources fill ONE review card (name, colours with the other colours found, heading/body font selects, logo, notes); the person edits it, then applies it to the open deck or saves it (Save as brand kit / Update my kit). Plan gate unchanged: Pro 1 kit, Gold and Premium 5, Starter none (the route refuses a Starter file BEFORE reading the body).

**What a kit stores:** main + accent colour and up to 8 extra colours, heading + body font (our supported fonts only), one logo (our asset), up to 20 pictures, the website address if it came from one. A kit has NO slide layouts. Applying a kit = recolour + fonts + logo on every slide (`applyBrandToTheme`); a new AI deck takes the default kit through `brandKitId` (generation/pipeline.ts).

**Layouts, per source (the straight answer):** a website cannot give layouts. A PowerPoint can: the same card has "Also use its slide layouts as a design (same format)", which uploads the same file to "Use a file's design" (routes/file-templates.ts), so one upload gives brand AND layouts. A PDF is a flat picture of each page: colours, fonts and logo only; the card says so. When the PDF template importer ships, flip `PDF_LAYOUTS_READY` in BrandTab.tsx.

**How the file readers work** (`services/api/src/brand/`): `POST /api/v1/brand/from-file` (20/hour/person, uploadGate, 15 MB, maintenance flag) → parse pool task `brand` (same worker thread, memory and time limits as every upload; no network) → `read-pptx.ts` or `read-pdf.ts` → `from-file.ts` (`profileFromRaw`: ranking, font mapping, notes; the logo is stored as the person's own asset, the file is not kept).
- PowerPoint: colours = theme accent slots (accent1 weighs most; slots no slide uses rank after used colours) + colours the slides really show weighted by shape area and text size x letters (backgrounds count a third, dark/pale panel tints are demoted, main/accent are picked among vivid colours); fonts = the importer's theme/used fonts with `original` kept and "X was replaced by Y" noted; logo = a small logo/icon picture in a corner, on the master/layout or repeated on most slides, at least 48 px; name = file name cleaned ("Acme_Brand_Template_2026.pptx" is "Acme"), else first slide title; the stock Office theme is flagged low confidence.
- PDF (pdf.js through unpdf; no canvas, no rendering): fill and text colours from the operator list with the transform matrix tracked (area / ink weighted; page backgrounds light; photos never count, except in a picture-only PDF where the page pictures are the design), font names cleaned from the embedded names, largest type = heading, most used small type = body, logo = a small decoded picture repeated across pages or in a corner (JPEG and Flate pictures decoded; PNG out), name = real title metadata, else file name, else the biggest words on page 1. Limits: first 12 pages looked at, 300 pages max, 16 Mpixel per picture, 40 pictures, 18 s budget. Password-protected, corrupt, wrong-type files get a plain sentence.

**Audit of the website flow with real sites (2026-11-13, one Pro account, 6 requests):** stripe.com (right: #533AFD, logo = touch icon, fine), tailwindcss.com (right: sky #38BDF8), notion.so (low confidence flagged, brand is black/white), allbirds.com (low flagged), figma.com (low flagged, multicolour brand), bbc.com (WRONG with "high": #DA532C was the favicon generator's default `msapplication-TileColor`; fixed: known generator defaults are ignored). Also fixed: a site using one face for headings and text got two different look-alike fonts (Stripe sohne-var) and "NotionInter" was not mapped to Inter; "Update my kit" ignored the logo and website of a lookup (kit kept the old logo): fixed in `updateKit`. Logos are mostly the site's square touch icon (180 px) because wordmarks are SVG (skipped); stored safely (magic-byte check, size cap, our storage). Not re-measured: the 34-site probe.

**Proof:** `from-file.test.ts` (21: built PDFs with exact colours/fonts/pictures, PowerPoints built in code, picture-only, grey-only, password, corrupt, page cap, JPEG logo, palette ranking, names), `from-file-route.test.ts` (8: plan gate, worker path, logo stored and served, isolation, update-with-logo, refusals, 413, page-count refusal, worker ends alone), suite `70-brand-from-sources` (12 checks, no AI; screenshots `e2e/results/70-*.png`), suites 20 (made self-contained) 23 and 24. Also checked by hand: a PDF exported by Microsoft PowerPoint for Mac gave the same colours as its .pptx.
**Not proven:** quality over many real brand PDFs/decks (only built files and two PowerPoint exports); fonts in a PDF exported from PowerPoint are the fonts PowerPoint substituted when the original was missing (Gill Sans MT showed as Aptos); CMYK/spot-colour and pattern fills; vector logos (not extracted from PDFs or PowerPoints, only pictures); scanned PDFs get colours only.
