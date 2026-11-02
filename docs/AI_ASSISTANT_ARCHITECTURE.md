# AI assistant (editor chat): architecture

> **Superseded by v2** (`docs/AI_ASSISTANT_V2_ARCHITECTURE.md`, built 2026-11-01). This file describes v1, still reachable as the fallback when the `assistant_v2` flag is off.

Written 2026-10-31 after a real chat went wrong: the user asked to "update the bg image" and the assistant proposed a paid AI picture that then floated on the slide instead of going behind it.

## Why it went wrong (four separate causes, not one)
1. **Keyword gate before the model.** A word-list rule (`needsSlideChoice`) saw "update … image" with no slide number and answered "Which slide?" before the model was asked. The model was never the problem.
2. **One tool for pictures, and it was paid.** The only picture operation was `add_image`, a proposal the user pays for. There was no free, instant way to change a background.
3. **Capabilities written as prose.** What the assistant could do was a hand-written list plus about 20 patch rules in one long prompt. New editor features (a picture behind ANY slide, the media library) were not in it, and it even told the model that finding stock photos was "unsupported".
4. **Thin view of the slide.** The model saw the background colour but not whether there was a picture, so "update the image" could not be resolved against what the slide had.
A fifth, in the editor: the "background" placement was refused on card layouts and silently turned into "floating" after the user had already paid.

## Principles
1. **Closed vocabulary, server-validated** (already true): the model only picks operations from a fixed list; the server checks every one (slide exists, not locked, plan allows) and the editor applies the result as one undoable command. The model never writes coordinates, CSS or a document.
2. **The assistant uses the same commands the toolbar uses.** One source of truth (`apps/editor/src/editor/commands.ts`): `setBackgroundPicture` is called by the toolbar, the media library, the AI-image placement AND the assistant. A feature built for people is available to the AI for free, and they cannot disagree.
3. **Free before paid.** A request that does not say "AI / generate / create an image" is satisfied from the photo library at once (stock search, then the template pictures). Generation stays a paid proposal that nothing charges until the user confirms.
4. **The slide you are on is the answer** for look requests (picture, background). Text edits still ask which slide, because an edit to the wrong slide is worse than a click.
5. **Say what really happened.** The reply is built from the applied list, never from model prose. If a free photo cannot be found, the answer says so and offers the paid generated one.
6. **Measured, not patched.** `scripts/assistant-eval.ts` sends real phrasings to the real model and checks the chosen operation. A phrase that fails in a real chat is added to the list first, then the prompt or code is fixed until it passes.

## What exists now (phase 1, pictures and backgrounds)
| Piece | File |
|---|---|
| New operation `add_photo {slideId, placement, query, alt}` | `services/api/src/ai/ai-assist.ts` |
| Looks up a free photo (stock, else template pictures), copies it into our storage | `services/api/src/ai/photo-resolve.ts`, `pictures/stock-import.ts` (shared with the media library route) |
| The route resolves photos after the model answers and returns `pictures[]`; if none found it explains and proposes a generated one | `services/api/src/routes/presentations.ts` |
| What the model sees per slide now: background kind (colour / picture / gradient) and number of pictures | `deckSummary` |
| Decision rules for pictures (generate vs free vs beside) | prompt, "PICTURES, free or generated?" |
| Look requests on the active slide skip the "which slide?" question and are priced as one slide | `needsSlideChoice`, `aimsAtOneSlide` |
| A background fits every slide; "beside" falls back to floating, never to background | `allowedPlacements`, `imagePlacements` |
| Picture background is one undo step and can be put back from the assistant history | `applyAssist`, `revertAssist` |
| Real-model check of 22 phrasings, per model (`EVAL_MODEL=…`), including the cheapest model and a confusing chat history | `scripts/assistant-eval.ts` (22/22 on the default route and on Gemini 3.1 Flash Lite, repeated rounds) |
| Real-browser check of the whole flow | `e2e/suites/54-assistant-background-picture.mjs` |
| The server enforces the words: a picture goes behind the slide only if the message says background / bg / behind / backdrop / wallpaper, whatever the model chose | `compileAssist` (`ASKS_FOR_BACKGROUND`) |
| A photo placed floating makes the slide "hand-edited" (protected from AI text rewrites); the assistant history removes it again | `placePhoto`, `snapshotAssist` / `revertAssist` (`placed`) |

## Lessons from building it
- Test the real model on the cheapest default model, not only the best one: the longer the prompt, the sooner the cheap model slips.
- Test the whole route, not only the model call: the first run of the evaluation passed while the chat still answered "Which slide?", because a keyword gate in the route ran first.
- When the model ignores a rule that must hold ("background only if asked"), enforce it in code and keep the prompt rule as a hint.

## Roadmap (phase 2 and 3: not built yet)
1. **Capability registry.** One table in code (name, when to use, parameters schema, executor, free or paid, examples). The prompt's operation list and rules are generated from it, so adding a capability is one entry plus one editor command, not new prose. Migrate the existing operations one family at a time, with the eval list as the safety net.
2. **Richer context ("world model").** Add the selected element (not only the slide), what the plan allows, and which resources exist (photos available, uploads).
3. **Toolbar abilities for the AI:** add shape, table, chart, text box, background colour/gradient (all already exist as editor commands).
4. **Verify step.** After applying, check the result deterministically (readability, picture present, nothing overflowing) and fix or report, instead of trusting the answer.
5. **Plans with several steps** ("make slide 3 a comparison with a photo behind it"): the model returns an ordered list, the server validates the whole plan, the editor applies it as one undo step.
6. **Eval gate.** Grow the phrase list from real chats; run it before any prompt change (a few cents per run) and keep the pass rate in the repository.

## Adding a capability (until the registry exists)
1. Make the editor command first (so a person can do it); test it in `apps/editor/src/editor/*.test.ts`.
2. Add the operation to `assistOperation`, describe it in the prompt (one line plus a decision rule if it overlaps another), compile it in `compileAssist` (validate slide, lock, plan, limits).
3. Return its result from the route, apply it in `applyAssist`, include its slide in the undo snapshot.
4. Add phrasings to `assistant-eval.ts` (including the phrasing most likely to be confused with a neighbour) and run it on the default model AND on the cheapest one (`EVAL_MODEL=vertex:gemini-3.1-flash-lite`), a few rounds each, before and after the change; add a browser check.

## Known limits
- Stock search needs an Unsplash or Pexels key on the server (`UNSPLASH_ACCESS_KEY`); without it only the template pictures are used. The Unsplash demo key allows 50 searches per hour in total, shared with deck generation.
- Photo credits are saved with pictures placed from the media library, but not for a background picture (the slide has no place to store them) and `SHOW_PHOTO_CREDIT` is off by owner decision; Unsplash's terms ask for credit once the production key is approved (see the launch checklist).
- A floating photo on a designed slide makes that slide "hand-edited": the assistant will then refuse to rewrite its text (Undo removes the photo and lifts that). Consider a gentler rule later.
- A picture behind a card layout can make cards hard to read; text colours are adjusted automatically, cards are not.
