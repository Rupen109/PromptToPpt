# Big video → slides (signed in) — functional flows

Up to **200 MB and 90 minutes**, signed-in only, **3 credits per started minute** (`credit_cost` `read_video`), refunded if it fails. Small audio (≤ 12 MB) still uses the quick inline route (`POST /sources/media`, see MEDIA_TO_DECK_FUNCTIONAL_FLOWS.md); every video and any longer audio uses this job.

## How it works
1. `POST /media/uploads {filename, bytes}` → job row (`media_job`), 8 MB parts. One active job per person, 6 a day, needs ≥ 3 credits.
2. `PUT /media/uploads/:id/parts/:n` — exact part size, written to temp disk (`MEDIA_TMP_DIR`). The browser retries each part up to 3 times.
3. `POST /media/uploads/:id/complete` — all parts and the byte count present; judged by magic bytes; ffprobe measures the real length (> 90 min refused, 180 min/day cap); price = minutes × 3; credits reserved; queued.
4. Worker (`startMediaWorker`, `MEDIA_JOB_CONCURRENCY`): ffmpeg extracts mono audio in 20-minute pieces → model listens (`media_read`); if there is video, ffmpeg samples frames, picks the ones where the screen changed (≤ 60), model reads their text (`video_read`); both merged into one timed source (`m:ss words` / `m:ss [on screen] text`). Temp file deleted.
5. Browser polls `GET /media/jobs/:id` (progress text on the chip); `DELETE` cancels (refund if still queued).

Safety: files from strangers only go to ffmpeg with `-protocol_whitelist file` and hard timeouts; a stuck job's lease expires and it is retried once, then failed and refunded; nothing speech-less/screen-less is charged ("nothing to build a deck from. You were not charged").

## Flows and proof
| # | Flow | Proof |
|---|---|---|
| A1 | Home screen: choose a video → chip shows progress → one timed source with what was said AND what was on screen; 3 credits | e2e 39 (real ffmpeg + real Gemini) |
| A2 | 130 MB file sent in 17 parts, same result, temp files gone | e2e 39 |
| A3 | A deck built from it carries spoken and on-screen facts | e2e 39 |
| A4 | Audio-only, 91-minute refusal, wrong part size, incomplete upload, fake file, > 200 MB, no credits, second job, other person's job, cancel + refund, model failure retried then refunded, silent file refunded, signed-out | `routes/media-jobs.test.ts` (real ffmpeg, mock model) 7/7 |
| A5 | Keyframe choice, timeline merge, part sizing | `media/media.test.ts` 7/7 |

## Before launch (also in the checklist)
☐ Run migration 0033 (journal timestamp fixed — it was older than 0032 and drizzle silently skipped it). ☐ Dockerfile now installs ffmpeg; check image size. ☐ Temp disk: up to 200 MB × concurrent jobs on the API host. ☐ Size API task ≥ 2 GB RAM / enough disk. ☐ Verify video/audio input through OpenRouter on the production model (not tested). ☐ Privacy Policy: recordings and screen frames are sent to the AI provider and deleted after processing. ☐ Real cost on production prices for a 90-minute video.
