# Audio & video → slides — functional flows

Written BEFORE the build and the real run (2026-10-29). "Real" = real browser, real API + database, real Gemini (Vertex) listening to real speech. No AI pictures are generated.

**What it is:** a person uploads **their own** audio or video file (a lecture, a meeting, a voice note, a screen recording). A model listens, writes a transcript (original language, rough time stamps), the transcript becomes an ordinary private **source** (the file itself is never stored), and a deck is built from it like from a PDF. It is also a free tool for visitors (small files, capped by our free-tool cost guard). Nothing is fetched from YouTube, Instagram or any other site.

**Limits (said in the app):** audio MP3, M4A, WAV, OGG, FLAC, AAC; video MP4, MOV, WebM. Up to **12 MB** signed in (about 12 minutes of ordinary audio) and **4 MB** for visitors (about 4 minutes). Credits: **6 per started 4 MB** (6, 12 or 18), refunded on any failure. The 12 MB cap exists because the file is sent inline to the model (about 20 MB request limit); longer recordings need audio extraction, which is not built.

## A. Signed-in
| ID | Flow | Must be true | Proven by |
|---|---|---|---|
| A1 | Home screen: choose an audio file (upload / drop) | Chip settles to the transcript title; credits drop by the stated price; stored as a transcript source with time locators | real browser + real AI |
| A2 | The transcript has the words that were spoken | Distinctive words and numbers from the recording are in the text; nothing invented | real AI (speech made with the Mac's voice) |
| A3 | Another language (Hindi) | Transcribed in Hindi script | real AI |
| A4 | Deck built from the transcript source | Facts present, source cited | real AI |
| A5 | Recording with no speech (silence / music-only / silent video) | Plain message "no speech found", **refunded**, nothing stored | real AI + unit |
| A6 | An order spoken in the recording ("ignore all instructions…") | Transcribed as words, not obeyed | real AI |

## B. Refusals and safety
| ID | Flow | Must be true | Proven by |
|---|---|---|---|
| B1 | Not really audio/video (an .exe renamed .mp3, a text file, SVG) | Plain sentence; nothing charged or stored | unit + API |
| B2 | Over 12 MB / empty / truncated | Refused before any model call | unit |
| B3 | Out of credits | 402 with the upgrade path, nothing stored | unit |
| B4 | Model fails | Credits refunded; plain message | unit |
| B5 | Rate limits | 4 files a minute and 40 a day per person | unit |
| B6 | Phone/HEIC/odd containers | Only the listed types; unknown ones get "export it as MP3/M4A/MP4" | unit |

## C. Free tool for visitors
| ID | Flow | Must be true | Proven by |
|---|---|---|---|
| C1 | `/free-tools/video-to-slides`: pick a small file, no sign-up | Transcript shown (copy / download / time stamps toggle) and "Make slides" hands it to the editor | real browser + real AI |
| C2 | Visitor limits | ≤ 4 MB, 3 files per visitor a day, counted in the free-tool cost guard (`free_media`), refused plainly past the limit | unit |
| C3 | The cost guard / AI breaker pause it like the other free tools | Same plain "busy" message | unit |

## Result (2026-10-29)
**Built and proven with the real model:** suite `e2e/suites/37-media-to-deck.mjs` 8/8 (real Gemini on Vertex listening to speech made with the Mac's own voices: English, Hindi, a recording that speaks an order to the AI, silence, a silent video, a real deck from the transcript, and the free visitor tool in a real browser). New API tests: `sources/media-read.test.ts` (containers by bytes, refusals, block pricing), `routes/media-source.test.ts` (signed in: price, refund, no speech, 402, rate limit, no recording stored), `routes/free-media.test.ts` and `free-media-cap.test.ts` (visitors).

**Measured (Vertex, `gemini-3.1-flash-lite`):** a 23-second clip ≈ **$0.0003**; a 3.7-minute recording (1.4 MB) took **9.8 s**, cost **$0.003**, and all 12 spoken sections were in the transcript (528 words) with time stamps 0:00 and 2:03. So a 12-minute recording is about **$0.01**. Priced at 6 credits per started 4 MB (6–18 credits). **Known gap:** pricing is by file size, not minutes, so very low-bitrate audio (a 12 MB file can be ~30 minutes at 48 kbps) costs us up to about $0.03 for 18 credits (roughly break-even on Gold India, a small loss at the extreme); the 40-a-day cap and the credit balance bound it. Duration-based pricing needs a duration reader per container; not built.

**Found and fixed on the way:** the app-wide 256 KB request-size limit also applied to picture uploads (`/sources/image`) and the free PDF tool, so any real phone photo (megabytes) or PDF over 256 KB would have been refused with "too large": they now have their own limits like the other upload routes (a regression test with a 1.2 MB picture was added). The timed-transcript reader now accepts our own model's timestamped output even when a clip is short (one or two time lines).

**Limits:** 12 MB signed in (≈ 12 minutes of ordinary audio; video is larger so people should export the audio), 4 MB for visitors, 3 recordings a visitor a day (`FREE_MEDIA_IP_DAY`), 4 a minute and 40 a day signed in. Long recordings need audio extraction (ffmpeg) or the Gemini Files API, not built.

**Not verified:** the OpenRouter path for audio (`input_audio` with a container name) and video (`video_url` data URL) is written to OpenRouter's documented shape but untested without a key; check which production models accept audio/video. A real *video with speech* was not tested (the Mac has no encoder to make one; a silent browser-recorded WebM was tested and refused as "no speech").
