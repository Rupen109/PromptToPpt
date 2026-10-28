# YouTube → deck (transcript route) — functional flows
Written before the real run (2026-10-28). The app never fetches YouTube. A person pastes YouTube's "Show transcript" text, or uploads a caption file (.srt / .vtt / .sbv); the transcript becomes a normal source (cited by minute, 0 credits) and the deck is built like any other.
| ID | Flow | Must be true | Proven by |
|---|---|---|---|
| A1 | Paste a YouTube link on the prompt bar | Dialog opens on "YouTube / captions" with the link filled in, with the 3 steps to copy the transcript | real browser |
| A2 | Paste the transcript, add it | 🎬 chip; stored as `transcript` with minute locators and the canonical video link; 0 credits | real browser + DB |
| A3 | YouTube link typed in "Website link" | Sent to the transcript tab, never fetched | real browser |
| A4 | Upload .srt / .vtt | Becomes a transcript source (auto-caption repeats and tags cleaned) | real browser + unit |
| A5 | API refusals | YouTube link as a website source → instructions; non-YouTube link in the transcript form → 400; look-alike hosts refused | unit + API |
| B1 | Deck from the transcript (real AI) | Most figures from the talk present and none invented; the transcript source is cited (quotes are attached to slides; a minute locator is stored on each part but the model does not always add it to the slide citation); an order hidden in the transcript is not obeyed | real AI |

## Result (2026-10-28)
Suite `e2e/suites/35-youtube-transcript.mjs` 6/6 in a real browser with the real model; 14 new unit/API tests (parser: SRT, VTT with auto-caption repeats, YouTube's copied format incl. h:mm:ss, plain text, too-little-text, size cap; link validation incl. look-alike hosts; routes; refusal to fetch YouTube).
**Note from the run:** a 6-slide summary does not always carry every figure (it kept 4–5 of 6 on three runs); that is summarising, not a defect, and the test allows it but forbids invented numbers.
**Not built:** automatic caption fetching (not allowed, see IMAGE_TO_DECK_FUNCTIONAL_FLOWS.md §D) and "Gemini watches the video" (needs an owner decision and an AI Studio / OpenRouter test).
