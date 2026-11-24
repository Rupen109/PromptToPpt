# Background removal: the production provider (decision recorded 2026-11-20)

**Decision (owner, in chat, 2026-11-20): use the best hosted provider for users.** Chosen: **Photoroom Remove Background API** (`POST https://sdk.photoroom.com/v1/segment`, header `x-api-key`, multipart `image_file`, options `format=png`, `crop=true`).

Why: the self-hosted models we tried are not cleared for commercial use (`BACKGROUND_REMOVAL_EVALUATION.md`), the production server cannot hold them (`BACKGROUND_REMOVAL_PRODUCTION_AUDIT.md`), and a hosted API needs no model in our process. Photoroom was the cheapest option found: about $0.02 a picture on its Basic plan (its own docs: "each API call is priced at $0.02"), against roughly $0.07 to $0.23 on remove.bg's published plans.

## What is built
- `services/api/src/media/photoroom.ts`: the adapter (picture sent as a PNG no larger than 6,000 px; 90 s timeout; every failure becomes a plain sentence; the provider's own text is never shown; a result is kept only if it is a PNG with real transparency, judged by the same check as any provider).
- `bg-providers.ts`: `photoroom` is the production default and is approved here; it is offered ONLY when `PHOTOROOM_API_KEY` is set. A development-only model can never be used in production.
- Tests: `media/photoroom.test.ts` (request shape, failures, key gating, approval evidence exists).

## Facts read from Photoroom's documentation (2026-11-20)
Input PNG, JPEG, WEBP, HEIC; output PNG, JPEG, WEBP; at most 50 MB and 6,000 px on the widest side; 25 megapixels recommended; `size` preview 0.25 MP, medium 1.5 MP, hd 4 MP, full 36 MP (default); `crop` trims the transparent border; sandbox mode (key prefixed `sandbox_`) is free, up to 1,000 calls a month, and every result carries a watermark.

## NOT verified (the owner must check before launch)
1. **Commercial use and ownership of the output pictures under the API terms: not found in the documentation pages read.** Read Photoroom's API terms and confirm in writing that results may be used commercially by our customers.
2. **Data handling:** the picture is uploaded to Photoroom. The privacy text must say so, and Photoroom's terms on keeping or training on uploads must be read.
3. **Rate limits for production keys** (not stated on the pages read) and the plan size: one credit of ours pays for one call; check the credit price of background removal covers $0.02 (about 1.7 rupees) plus margin.
4. **A live call** has not been made (no key in this environment). Use a `sandbox_` key first: results carry a watermark, so they are for testing only.

## To turn it on
Set `PHOTOROOM_API_KEY` in the production environment (and in development with `BACKGROUND_REMOVAL_PROVIDER=photoroom`). Without the key the feature stays "not available", as before.

## Not changed
The editor's brush dialog (hand-refining the mask) still needs a mask from our own model and stays development-only; the one-click cut-out (chat and button) uses the provider.
