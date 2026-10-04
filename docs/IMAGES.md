# AI pictures

## What users can do
- **AI assistant** ("add a photo of a red hatchback as the first slide background") → the assistant *proposes* pictures (`add_image`); a card shows the prompt, placement and the credit price. Nothing is generated or charged until the user presses **Generate**.
- **Insert → ✨ AI image…** (or ✨ AI image on a selected picture frame): describe the picture, pick a style (photo / illustration / 3D / minimal / abstract / watercolour), quality (image model tier) and where it goes, preview it, then **Use this picture** (or try again).
- Placements: *full-slide background* (title, section, thank-you, quote, big-number slides — dark overlay keeps text readable), *picture beside the text* (title-body ⇄ picture+text), *replace the selected picture*, *free-floating*.

## Cost control (all server-side)
| Control | Where |
|---|---|
| Plan limits: pictures per presentation / per month (Starter 3 / 6 · Pro 10 / 60 · Gold 20 / 100) | `plan.max_images_per_*`, checked inside an advisory-locked transaction that reserves a `pending` slot, so parallel requests cannot exceed them |
| Credits per picture by quality tier: 20 / 60 / 200 | `credit_cost` (action `image`), reserved atomically + idempotently by `requestId`, refunded on any failure or refusal |
| Tier gate: Starter → fast model only; Pro adds balanced; Gold adds studio | `assertModelTier`, fallbacks stay inside the chosen tier |
| Kill switch | `IMAGES_ENABLED=false` (API answers `IMAGES_DISABLED`); serving existing pictures keeps working |
| Retries/duplicates | same `requestId` → same picture, charged once; refused prompts (`blocked`) are not retried and are refunded |
| Ledger | every attempt writes an `ai_usage_event` (`image_generation`, per-image cost; token counts kept but not priced twice); each picture also has a `generated_asset` row with cost |
| Assistant can't spend | it only emits `add_image` proposals; generation is a separate user-confirmed call |

## Storage & serving
Bytes live behind `AssetStorage` (`services/api/src/storage`): local disk in dev (`.data/assets`, gitignored), S3 in production (`ASSET_STORAGE=s3`, private bucket, IAM `s3:PutObject/GetObject` on `generated/*`; **not live-tested** — unit-tested with a fake client). Pictures are served by capability URL `GET /api/v1/assets/:id` (192-bit random id, allow-listed image types, `nosniff`, sandbox CSP, immutable cache, cross-origin allowed) so slides render for share viewers and exports without a login.

## Providers
Vertex/Gemini image models verified live (fast ≈6 s, balanced ≈12 s, studio ≈17 s). OpenRouter `generateImage` (modalities `image,text`) is fixture-tested only. Model prices in `model_catalog.price_per_image_usd` are conservative estimates — reconcile with Cloud Billing / OpenRouter before relying on margins.

## Honest limits
Pictures are AI artwork: they cannot contain readable text and will not match a *specific real product or person* (a "Tata Aeris" request yields a generic car). Uploading your own photo, picture library/reuse, and generating pictures during deck generation (visual budget) are not built yet.
