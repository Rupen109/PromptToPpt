# Edit with AI: full QA with real prompts (2026-11-21)

**How it was run:** `e2e/ai-full-qa.mjs` (cases in `e2e/ai-full-qa-cases.mjs`). Real browser, real editor, real API, real Gemini model; nothing faked. Each case copies a deck into a fresh Gold account, opens the editor on the slide the person was on (selecting the object they meant), types the prompt, lets the editor apply and save, then judges the **saved deck**. Every case also has a screenshot, and I reviewed the screenshots of the visual cases myself.
- **R** cases: the exact words real people typed in our editor (4 real accounts, from `ai_chat_message`), replayed on a copy of **their own deck as it was before they chatted**.
- **C** cases: everyday requests from `AI_EDIT_HONESTY_AND_SCENARIOS.md` §6 that the doc says are done.
- **PROD READY** = the request is 100% on the saved deck, the chat says what really happened, and nothing else broke. Anything less is **NEED TO FIX**.
- AI picture generation was not confirmed (no AI images in tests), so those cases are **NOT TESTED**.

**Result: 50 PROD READY, 34 NEED TO FIX, 5 NOT TESTED (89 cases).**

## NEED TO FIX (34)

### A. It says "Done" but the work is missing or wrong (worst)
| Case | Prompt | What really happened |
|---|---|---|
| R01 | i want to update the text color to off white | Only slides 1-8 changed; slides 9-10 untouched; chat said "Done". Cause: `resolve.ts:139` `items.slice(0, 60)` silently drops every object after the 60th |
| R02 | update the text color to red | Same: 77 of 101 text runs red, slides 9-10 skipped, "Done" |
| R25 | also add 5 points total in timeline | "Done — rewrote slide 4", timeline still has 4 points |
| R24 | add detailed info here in academemic pursuits | "Done — rewrote", same word count (46 → 46), no extra detail |
| R38 | add more content in the 2nd slide | "Done — rewrote", 46 → 46 words |
| R39 | …then "no you please add the content from yourself" | "Done" twice, still 46 words |
| R11 | currently its 3 bullet points, please add 2 more in both side | Added 3 per side (3 → 6), not 2 |
| C30 | increase the font size of the body text on slide 4 | Body text went from 42 to **24** (smaller), "Done" |
| C27 | make the text on slide 2 white | The italic part of the title stayed blue |
| C38 | make the title on slide 1 red | The italic part of the title stayed blue |
| R28 | add 4 slides, then "all 4 slides … format is same so update all 4 slides format" | Slides 7-10 were 4 DIFFERENT layouts; AI made all 4 the SAME (split image), each with an empty picture box |
| C37 | replace all pictures with better ones | Thank-you slide lost its picture; slide 8 got the same photo back |
| R15 | make the theme dark (Morph deck) | "Done — applied" but nothing visibly changed (a note explains it) |

### B. The change is made but the slide is broken
| Case | Prompt | What really happened |
|---|---|---|
| C05 | move the picture to the left | Picture now covers the title and all bullets |
| C04 | make this image bigger | Picture now covers the bullet text |
| C03 | make the title bigger | Title runs off the left edge and touches the subtitle |
| C20 | make the theme minimalist | One run: the new design ("Slate") dropped the photos on slides 1 and 10 with no mention (another run picked a design that kept them) |

### C. Wrong action, or should have done it
| Case | Prompt | What really happened |
|---|---|---|
| C23 | add statistics to slide 4 | Added a rectangle |
| R33 | image is not visible clearly because of overlay please fix it | Made the picture brighter, did not touch the overlay |
| R43 | add the images also please.. | Offered to REPLACE every existing picture instead of adding pictures |
| R12 | add more data please | Refused: "attach a PDF" (people expect the AI to write it) |
| R21 | update the shape of the this image | Refused with a note about rounded corners, no question about which shape |
| R42 | make the dark theme of environment | Dark, but the environment (green) colours were lost |
| R07 | update the font style to moneto | Set Space Mono + IBM Plex Sans without saying "moneto" is not available |
| R06 | change the fonts style | Asked "which style?" instead of changing (a clear request with one sensible reading) |
| C14 | center the title | "already like that" but the title is left-aligned |

### D. Done correctly, but the message is wrong or confusing
| Case | Prompt | Message problem |
|---|---|---|
| R17b | please remove the background from this coffee image… (own picture) | Cut-out works; but notes say "already has a transparent background" AND "something else changed you did not ask for" (the Morph template's other scenes, which is the intended rule) |
| C43 | remove the image from slide 3 | Removed correctly; note says "slide 3 had no picture to remove" |
| C18 | add speaker notes to every slide | Notes correct; asks "This rewrites the words of 10 slides" and reports "Rewrote the text on slides 1-10" (words were not changed) |
| C07 | duplicate slide 2 | "Duplicated slide 3" |
| C08 | move slide 3 to the end | "Moved slide 10" |
| C13 / C16 / C26 | make all the titles bold / add a fade transition to all slides / make the theme light | Already so; message starts "I couldn't do that" instead of "Nothing needed changing" |

## NOT TESTED: AI picture generation not confirmed (5)
R05 Add a picture to the title slide · R31 add images here in the ppt please · R32 in the last slide please add image · R44 add best image in this first slide background… · C36 replace this image with a better one. Each one only proposed an AI picture (costs credits, needs a click). Note: R20 ("background image related to narendra modi") put a free photo in directly, but C36 proposes a paid AI picture: the same kind of request takes two different paths.

## PROD READY (50)
**Real (24):** R03 make theme light → revert · R04 light → dark again · R08 add thank you page also · R09 thank-you background same as other slides · R10 add 2 more bullet points here · R13 please edit content in 2nd slide (asks what to change) · R14 change theme to light · R16 remove the party popper (honest: nothing like that in the deck; the old answer swapped the whole template) · R18 add 2 more slides · R19 change fonts to professional · R20 thank-you background image (Narendra Modi) · R22 make this image a circle · R23 add thank you page · R26 green color is not good · R27 add 4 more slides in between (asks with cost first) · R29 Improve hierarchy slide 7 · R30 Rewrite slide 7 · R34 add the thank you page at lat · R35 edit the last slide content (asks) · R36 please edit 11 number slide content (asks) · R37 give me some water please · R40 hii · R41 environment colours · R45 thank-you text is not visible (already readable).
**Catalogue (26):** C01 shorter · C02 translate to Hindi · C06 delete · C09 swap · C10 two columns · C11 black background · C12 Poppins · C15 circle · C17 animate title · C19 add slide after 5 · C21 review · C22 what can you do · C24 slide numbers · C25 video (refused) · C28 gradient · C29 lock · C31 reduce to 6 (confirm) · C32 merge · C33 less crowded (honest: not crowded) · C34 premium · C35 four things at once · C39 table slide · C40 text bigger · C41 all backgrounds white · C42 accent blue · C44 grammar.

## Root causes (one fix each covers several cases)
1. **Silent caps and limits say "Done":** the 60-object cap (R01, R02) and layout capacity when adding points/detail (R24, R25, R38, R39, R11). The check only proves "the words changed", not "what was asked happened" (count of points, more detail).
2. **Text colour ignores coloured parts of a title** (C27, C38): run-level colours (the italic accent word) are not overridden.
3. **"Increase" planned as a smaller absolute size** (C30).
4. **Moving or resizing objects ignores the layout** (C03, C04, C05): it warns about the overlap but leaves a broken slide.
5. **Answer wording:** "I couldn't do that" for already-done, slide numbers after the change instead of the ones asked about, notes reported as rewrites, contradictory notes, Morph scenes flagged as unasked changes, "Done" when nothing visible changed (C07, C08, C13, C16, C18, C26, C43, R15, R17b).
6. **Understanding/routing** (model guide + code): statistics → shape (C23), overlay → brightness (R33), add images → replace all (R43), more data → needs a source (R12), image shape (R21), dark + keep colour family (R42), unknown font not said (R07), unneeded question (R06), "make these layouts different" (R28), centre already-so (C14).
7. **Design and picture swaps lose pictures** (C20, C37).

Re-run: `QA_DECKS=<decks.json> QA_OUT=<dir> E2E_WEB=http://localhost:3100 node e2e/ai-full-qa.mjs [CASE_ID ...]` (the seed decks are real people's decks, so they stay out of the repo; rebuild them from `presentation_version` before each deck's first chat message).
