---
name: ai-images
description: How AI picture generation works in promptToPpt — limits, credits, storage, assistant proposals, slide placements. Use when touching image generation, the asset route, image limits/credits, picture backgrounds, or the AI image dialog.
---

Read `docs/IMAGES.md` first. Invariants:
- Generation is ONE endpoint: `POST /api/v1/presentations/:id/images` (`services/api/src/routes/images.ts`). Order: plan gate → tier gate → advisory-locked quota **slot** (`generated_asset.status='pending'`) → credit reserve (idempotent by `requestId`) → `gateway.image()` → storage → mark `ready`. Any failure after a reservation releases BOTH slot and credits. Never add a code path that calls a provider without a slot + credits.
- `AIGateway.image()` is the only way to call an image model: same-tier fallbacks only, ledger row per attempt, per-image cost only, mime allow-list (png/jpeg/webp) and 8 MB cap. `blocked` errors are never retried.
- The assistant (`ai/ai-assist.ts`) may only *propose* pictures (`add_image`); the editor's card/dialog makes the paid call after the user confirms. Keep it that way.
- Slide model: full-slide backgrounds are `slide.background = {type:'image', value:url}` composed by `photoSlide()` (scrim + white text) and only for `IMAGE_BG_LAYOUTS`; picture+text keeps the URL in `content.imageUrl` so re-composition (theme change, AI edit) never loses it. Every recompose path passes `{backgroundImage}` (see `photoOf` in editor `commands.ts`). The validator judges text over a picture against a WHITE worst case.
- Pictures are served only through `GET /api/v1/assets/:id` (capability URL, registered before secureHeaders on purpose). Storage keys are validated (`assertSafeKey`).
- Tests: `packages/ai/src/images.test.ts`, `services/api/src/routes/images.test.ts` (limits, parallel slots, idempotency, refunds), `packages/theme/src/photo.test.ts`, editor `picture commands`. Real-model check: generate with each `vertex:*image*` model via a throwaway script (don't commit it).
