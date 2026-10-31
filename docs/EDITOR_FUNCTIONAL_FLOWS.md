# Editor — functional flows and how each was proven

The editor is the heart of the product. Every flow below was run in a real browser against the real API and database
(`e2e/suites/44-editor-core.mjs` for the core promises; older suites 04, 05, 11, 13, 14, 16, 20, 23, 24, 25 for the rest).
The checks look at what the **server stored**, not only at what the screen shows.

## 1. Autosave
| Flow | Proof |
|---|---|
| A text edit reaches the server by itself (revision goes up) | 44 |
| 15 quick nudges end in one saved position, same after reload | 44 |
| Offline: the status says so, the edit stays on screen, everything saves when the connection returns | 44 |
| Leaving the editor right after typing does not lose the last edit | 44 |
| Undo and redo are saved too | 44 |
| Same deck in two tabs: edits on different slides are merged (nothing lost); edits to the same text end Saved and identical in both tabs | 44 |
| Saving is conflict-safe: the client names the revision it is based on; the server answers 409 instead of overwriting | `presentations.test.ts`, 04 |

## 2. Text formatting
| Flow | Proof |
|---|---|
| Bold, Italic, Underline: change what is drawn and are stored on every run; turning italic/underline off removes the flag | 44, `editor.test.ts` |
| Bullet list, Numbered list, Link (one web address for the whole box; empty removes it) | 44, `editor.test.ts` |
| Ctrl/Cmd+B, I, U while typing | 44 |
| Size, alignment and colour persist after a reload exactly as chosen | 44, 04 |
| Editing words next to an emphasised word keeps the emphasis (italic, colour, link) of the untouched words | 44, `editor.test.ts` (`retextParagraphs`) |
| Underline is exported to PowerPoint | `pptx.ts` (`underline: { style: 'sng' }`) |

Limits (by design): bold/italic/underline/list/link act on the whole text box; per-word formatting inside the editor is not offered (it
is kept when the deck was generated with it).

## 3. Themes, fonts, colours
| Flow | Proof |
|---|---|
| 12 different palettes: each changes the stored primary colour and every text stays readable | 44 |
| Heading and body fonts: what is drawn, what is stored, survives reload | 44 |
| Dark and Light deck mode: backgrounds flip, text stays readable, stored colours differ | 44 |
| A slide added after a theme change matches the theme | 44 |
| Undo of a palette change reverts on screen and in the stored deck | 44 |
| A hand-picked slide background applies to that slide only; text on it stays readable | 44, `editor.test.ts` |

A hand-picked slide colour gives that one slide its own readable text and brand colours (`setSlideBackground` writes `themeOverrides`
only when the deck's normal colours would not be readable on it); picking a colour that works with the theme removes the overrides.

## 4. Templates
All 137 catalogue templates are applied one after another to a real 11-slide deck (44): every one keeps text readable (measured on the
drawn slide, against the colour or panel actually behind the text), nothing is lost, and the deck saves valid. Also 16 (categories, search,
lock on Starter, undo) and 03 (create from template).

## 5. Brand from a website / brand kits
Suites 23 (website lookup: real sites, every failure message, rate limit, unreachable API), 24 and 25 (kits: plan limits, logo and pictures,
apply everything / only ticked parts, one undo, logo on every slide in 16:9, 4:3 and 1:1, Present mode, PPTX export, real AI deck "in my brand").

## 6. Asking the AI to change something
Suite 05 (real model): restyle the whole deck, fonts and animation, edit one slide, add a slide, vague request asks which slide, picture proposals,
honest "can't do that", undo by saying "put it back" (also after a reload). A model's wording can differ from run to run, so the two
checks that depend on it (the "why did you change the theme" reply and the "which slide?" question) get one retry.
The assistant allows 15 requests a minute.

## 7. Pictures
"Image URL" no longer points a slide at someone else's address (the page's content policy only allows pictures from us and the photo
libraries, so it would show nothing in production). The server downloads the picture (`POST /presentations/:id/images/import`: public
addresses only, every redirect re-checked, 8 MB, PNG or JPEG by content, 300 per person) and the slide uses our own copy.
Proof: `image-import.test.ts`, 44.

## 6b. "Which slide?" is asked, never guessed (2026-10-29)
A short request that is plainly about ONE slide's content and names no slide ("make the title shorter", "add more points", "rewrite this") is
answered by the server with a question — no model call, no credits, nothing changed (`needsSlideChoice` in `ai-assist.ts`). The panel offers
**Slide N (this one)**, **All slides** and an **Another slide…** list (every slide by number and title). Requests that name a slide, say
"every slide", are deck-wide (colours, fonts, theme, animation), are undo/why questions, add a slide or are long (a topic) go to the model as before.
Proof: `slide-choice.test.ts` (33 phrasings), `ai-assist.test.ts` (free, unchanged), suite 05.

## 6c. Present mode is a paid feature (2026-10-30)
On the Starter plan the **Present** button opens the upgrade window (like Export), and typing `/present/<id>` by hand sends the person back to the editor with the same window.
It uses the same plan fact as export (a plan with no export formats), so there is no separate flag. This is a screen-side lock only: Present just draws a deck the person can already load, so
unlike export there is no server step to refuse. Proof: suite 04 ("starter: Present is locked…"); Pro still presents (04, 28).

## 6d. Deck typography and template choice (2026-10-30)
See docs/DECK_QUALITY.md: a type scale (body 21 pt median, never below 11 pt without shortening the words), one size per level, cards that hug their text, and a template chosen for the topic. Proof: suite 47 (real model), theme tests (443), `design-pick.test.ts`, `theming.test.ts`.

## 6e. The assistant and ONE slide's background (2026-10-30)
Found in a customer's chat: after "add thank you page also" the new slide had a different background; "make it match the other slides" made the assistant restyle the whole deck, then "put it back", then refuse ("Only the selected slide can be changed here"). Cause: the assistant had no action for one slide's background, only deck-wide colours, and it read an explanation as a complaint.
Now: `set_slide_background` (a hex, or `deck` = the background the other slides share) works in both scopes for the chosen slide, the text on that slide stays readable (editor `setSlideBackground`), it is one undo step and the assistant can put it back; an explanation of the wanted result is a request, not a complaint; with two matching slides (two thank-you pages) the one just added wins. Proof: `ai-assist.test.ts` (6), `editor.test.ts`, suite 49 (real model, the customer's exact five messages).

## 6f. The assistant panel: no scope switch, no credits, real list edits (2026-10-30)
* The **Whole deck / This slide** switch is gone. The message says where ("slide 3", "the thank-you page", "every slide"); when it does not, the chat asks with buttons (this slide / all slides / another by number). A message that names one slide is priced as one edit, a deck-wide one as two.
* Credits are no longer shown in the chat (balance and costs stay on the Billing page; the price of an AI **picture** is still shown on its Generate button because that is a separate purchase).
* **"The text is not visible"** after a background change: slide text is re-checked against what is behind it whenever a background changes (fixed-colour covers / thank-you pages included), and the assistant has a `fix_readability` action and sees each slide's background and a low-contrast flag, so it fixes the text instead of undoing the change.
* **"Add 2 more bullet points"**: comparison slides hold 6 per side (was 4), the assistant is told every layout's maximum and to count, and when it cannot add what was asked the chat says why. Proof: suites 49 (background, readability) and 50 (more points), both with the real model; `ai-assist.test.ts`, `editor.test.ts`, `comparison-six.test.ts`.

## Found and fixed while testing
1. Hand-picked dark slide background left dark text on it (unreadable) → per-slide readable colours.
2. Editing any text flattened its formatting (italic words, emphasis colours, links were lost, only the first run's bold stayed) → formatting is kept.
3. No Italic, Underline, list or Link controls (the document supported italic, lists and links) → added, with keyboard shortcuts.
4. "Image URL" showed a blank picture under the page's image policy → server-side import.
5. Typed symbols (⧉ − +) in the element toolbar → lucide icons.

## Still open
* Per-word formatting selection inside the text editor (the toolbar acts on the whole box).
* Underline is stored by this version; decks exported before it simply have none.
