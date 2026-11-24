# Remix & Duplicate — functional flows and how each is proven

Written BEFORE the end-to-end run (2026-10-10) so the checklist cannot be bent to fit the results. "Real" = real browser, real API server and database, and the real AI model where the flow involves it (dev provider: Vertex). Unit tests use a mock AI and are listed separately.

Status values: ✅ passed in the real run · ❌ failed.

**Final result (2026-10-10): every flow below passed in the real end-to-end run — suite `e2e/suites/22-remix-journey.mjs` 15/15 (real browser, real server, real AI), plus the other editor suites 92/92 with the shared-code fixes in place. Flows C3 and A2 were added/fixed during this run (see "Found by the real run").**

## A. Entry and access
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| A1 | Owner on Pro opens ⋮ menu | "Duplicate presentation" and "Remix this presentation…" are visible | real browser  | ✅ |
| A2 | Person invited to EDIT the deck (not the owner) | Remix and Duplicate are NOT offered (server is owner-only; no dead-end error) | real browser, 2 accounts  | ✅ |
| A3 | Starter owner starts a remix | Upgrade prompt; nothing created, nothing charged | real browser  | ✅ |
| A4 | Signed-out / other user calls the API | 401 / 404 | API tests | ✅ (unit) |

## B. Duplicate
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| B1 | ⋮ → Duplicate | Opens "Copy of X" with the same slides, look, format; original untouched; both in "Created by me" | real browser  | ✅ |
| B2 | Edit the copy (title + a slide), reload | Copy keeps the edit; original unchanged | real browser  | ✅ |
| B3 | Duplicate while there are unsaved edits | The copy contains them | real browser  | ✅ |
| B4 | Deck inside a project | Copy is in the same project | API test  | ✅ real |
| B5 | The copy works like any deck | Present mode opens, PPTX export downloads | real browser  | ✅ |
| B6 | Delete the copy | Gone from the library; original still there | real browser  | ✅ |
| B7 | Monthly deck allowance reached | Clear message, no copy | real API with a limited plan  | ✅ |

## C. Remix dialog (no AI)
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| C1 | Open, type key by key, Esc | Typing keeps focus; Esc closes; nothing created | real browser  | ✅ (re-run in the real suite) |
| C2 | Idea chips, slide count box, "N slides" in text | Chip fills text; count follows the text until edited; two-digit typing works; capped by plan | real browser  | ✅ (re-run in the real suite) |
| C3 | Model choice | A model list with credits per slide; the credit estimate follows the model and the count | real browser  | ✅ (built during the run) |
| C4 | Hand-edited slides | Dialog says how many are used "as they look now" | real browser  | ✅ (re-run in the real suite) |
| C5 | Phone width | Dialog fits, scrolls, buttons reachable | real browser, 390px  | ✅ |
| C6 | Cancel / close | Nothing created, nothing charged | real browser  | ✅ |

## D. Remix journey (REAL AI)
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| D1 | Start a remix | Progress screen with stages → completes → the NEW deck opens in the editor | real browser + real AI  | ✅ |
| D2 | The result | New id; chosen number of slides; same format (e.g. 4:3); same theme; sensible title; every slide renders (no blank slide, validation not failed) | real  | ✅ |
| D3 | The original | Byte-for-byte the same document after the remix | real  | ✅ |
| D4 | Library | Original and remix both listed; remix opens from the list | real browser  | ✅ |
| D5 | Credits | Balance falls by exactly slides × price of the chosen model, once; ledger has one charge | real, ledger read from the database  | ✅ |
| D6 | Content faithfulness | Figures from the original are kept; no number appears that is not in the original; "leave out X" is respected | real AI, checked in text  | ✅ |
| D7 | Hand-edited slide | Text typed by hand in the editor is in the source the AI was given (deterministic) and, when kept, in the result | real browser + DB  | ✅ |
| D8 | Brand logo | A deck with a brand logo gives a remix with the logo on every slide | real  | ✅ |
| D9 | Reload mid-generation | Progress resumes; deck still opens when done | real browser  | ✅ |
| D10 | Cancel mid-generation | Cancel button works; no deck; credits refunded (early stage) | real browser  | ✅ |
| D11 | Double click on Create | Exactly one job and one charge | real browser + DB  | ✅ |
| D12 | Not enough credits | Clear message, no job, no deck, no charge | real browser + DB  | ✅ |
| D13 | Language | A Spanish deck is remixed in Spanish | real AI  | ✅ (real AI via the API; the language fix is unit-tested) |
| D14 | Instruction number vs box | Box wins; deck has exactly that many slides | real AI | ✅ (earlier, API) |

## E. The remixed deck is a normal deck
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| E1 | Edit the remix, reload | Edit persists | real browser  | ✅ |
| E2 | Present mode | Opens and shows slide 1 | real browser  | ✅ |
| E3 | Export PPTX | Downloads a valid file with the right slide count | real browser  | ✅ |
| E4 | Style → apply a template / palette | Works; brand logo stays | real browser  | ✅ |
| E5 | AI assistant on the remix | Answers an edit request | real browser + real AI  | ✅ |

## F. Robustness
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| F1 | Unusual text (emoji, quotes, `<script>`, very long title, accents) in the original | Remix completes; nothing breaks or executes | real  | ✅ |
| F2 | Long original (about 30 slides) condensed | Completes; within time; sensible | real AI  | ✅ |
| F3 | Two remixes of the same deck, one after the other | Independent decks | real  | ✅ |
| F4 | Browser Back after the remix opens | Lands somewhere sensible, not a broken page | real browser  | ✅ |

## G. A new shape for the remix, and the vertical 9:16 format (2026-11-18)
A remix can now be made in any of the four shapes: Widescreen 16:9, Standard 4:3, Square 1:1 and **Vertical 9:16** (1080 × 1920, for stories, reels and phones). Vertical is also offered on Create from scratch and on the Templates page. Written before the run; proven without AI (the start request is answered by the test, everything else is real).
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| G1 | The Remix dialog opens | A "Format of the new version" row lists the four shapes and marks the deck's current one ("now") | suite 74 | ✅ |
| G2 | Remix with the format left alone | The job carries no `aspectRatio` (the original's shape is kept) | suite 74, API test | ✅ |
| G3 | Remix with 9:16 chosen | The job carries `aspectRatio: '9:16'`; the new deck is vertical, in the original's look, its slides laid out again; the original is untouched | suite 74, `remix/format-and-file.test.ts` | ✅ (mock model) |
| G4 | A vertical deck in the editor | The slide is drawn at its true shape, small enough to fit the screen's height (no scrolling to see the bottom), thumbnails and the Present view too | suite 74, by eye | ✅ |
| G5 | Every layout and design at 9:16 | All 137 designs (1,402 slides) and every layout × theme compose without an overflow or contrast error | theme tests, a catalogue run | ✅ |
| G6 | Tall slides look arranged for a tall slide | Chart over its takeaway, picture above the words, comparison and case study stacked, metrics / process / timeline / agenda in one column, a long figure on one line | `layout/portrait.test.ts`, by eye (dev gallery `/dev/gallery?aspect=9:16`) | ✅ |
| G7 | Export a vertical deck | PowerPoint: a portrait page of 9:16; PDF: 810 × 1440 pt portrait, one page per slide; HTML: 1080 × 1920 slides | `export/pptx-vertical.test.ts`, browser | ✅ |
| G8 | Morph with 9:16 | Refused with a clear message (Morph is widescreen); a deck in your own design keeps that file's shape | API tests | ✅ |

## H. Remix a PowerPoint (2026-11-18)
Home → "Remix a PowerPoint" (Pro, Gold, Premium; Starter sees the Pro lock and the upgrade message). Choose a .pptx; its slide text and speaker notes are read on the server; say how it should change; pick the length and the shape; get a NEW presentation built from that file's content in a fresh design. The file is never changed. Charged per slide like any deck.
| ID | Flow | Must be true | Proven by | Status |
|---|---|---|---|---|
| H1 | Starter opens it | The Pro lock and the upgrade message; no dialog; nothing uploaded | suite 74 (fresh account), API test | ✅ |
| H2 | A file that is not a PowerPoint (text, PDF) | A clear message; Create stays off | suite 74, API test | ✅ |
| H3 | A real .pptx | "N slides with text read"; the slide count prefilled (within the plan's limit); the title is the file's name | suite 74, API test | ✅ |
| H4 | Create | The job carries the file's source, `remixFile` (its title), the shape, the length and the instruction; the person lands on the progress screen | suite 74 | ✅ |
| H5 | The job through the real pipeline | A new deck in the chosen shape and length, valid, with the file kept as its source; refused without the file, on Starter, or combined with rewrite / Morph / your own design | `remix/format-and-file.test.ts` | ✅ (mock model) |
| H6 | The language | The brief quotes the file's first words and tells the model to write in their language (no language detector); a language chosen on the request wins | unit test | ✅ (the brief); ✅ real model, 2026-11-19: a Spanish file gave a Spanish deck (suite 75) |
| H7 | Faithfulness | Figures and claims of the file are kept, nothing invented, "leave out X" respected: the same brief rules as a deck remix | the brief | ✅ real model, 2026-11-19 (suite 75, 6/6): a 6-slide Spanish .pptx became a 5-slide 9:16 deck; every figure came from the file, the hiring plan asked to be left out was left out, all slides valid and inside the page. Bug found and fixed by this run: after the job finished the progress screen sent the person Home instead of opening the editor |

**Not in this version, said plainly:** only the file's text and notes are used (pictures, charts and tables in the file are not read; the new deck gets its own pictures); the file's look is not kept (a fresh design is chosen; use "Use a file's design" to build in its look); old .ppt files are refused (save as .pptx); the Morph engine and Morph templates stay widescreen (16:9) only; the architecture and table layouts are plain on a vertical slide.

## Found by the real run (all fixed, each now covered by a test)
1. **Duplicate → your edits in the copy were never saved.** The editor's "last saved edit" counter was not reset when moving to another deck, so the copy's first edit looked already saved (status stuck on "Unsaved changes…", reload lost it). Fixed in `autosave.ts`; covered by suite 22 (B1/B2/B3).
2. **Leaving a deck right after an edit lost that edit** (the 1.5 s save delay was dropped on navigation). Fixed: pending edits are sent when leaving; covered by G1.
3. **Remix and Duplicate were offered to people invited to edit**, who then hit "not found". Now owner-only in the menu; covered by A2.
4. **Remix dialog was wider than a phone screen.** Fixed; covered by C5.
5. **No model choice in the Remix dialog** (the Create screen has one; the dev default model is the slow one). Added, with the credit estimate following the choice; covered by D1/D5.
6. **Brand logo was missing on hand-edited slides** (they are never redrawn when the theme changes). Logo elements are now flagged and swapped directly on those slides; covered by the unit tests and `20-brand`.
7. Earlier hardening (server tests + a first real run): remix needs its source text; cleanup race; language; slide-count mismatch; unsaved edits; typing; hand-edited slides read as they look now; the dialog hook stealing focus.

## Test-quality notes (so the results can be trusted)
- Several failures of the suite itself were test mistakes, found and corrected: number matching with punctuation, comparing against the original's stored text instead of what it shows, picking a model before the list had loaded. None hid a product bug.
- `REMIX_ONLY=<prefix>` runs a single check without paying for the real-AI ones.
- Real AI spend per full run of suite 22: roughly ₹4–6.
