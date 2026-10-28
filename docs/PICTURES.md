# Pictures in generated decks

Owner decision (2026-10-07): pictures must be **fast and never block a deck**. No model is involved in choosing a picture, and nothing is ever AI-generated automatically.

## How a picture is chosen (`services/api/src/pictures/pick.ts`)

1. **Stock search.** Unsplash first, then Pexels if `PEXELS_API_KEY` is set. The search words are written by the outline (`imageQuery`, 2–4 plain words such as "electric car charging"). The best result is taken at once — Unsplash ranks by relevance; ties are broken by how well the photo's own description matches. Photos are **hotlinked** (never downloaded or stored), with the photographer credited and tracking links, and Unsplash's download endpoint is pinged when a photo is used (their API guidelines).
   - A photo whose description shares no word with a *derived* search is skipped; the outline's own search words take the top result as is.
2. **Library fallback.** If stock gives nothing — no results, a rate limit, an error, no key, or no answer in 6 s — the slide gets a photo from our own library (`apps/web/public/template-assets`, the pictures that ship with the templates): a tagged match if there is one, otherwise any picture of the deck's category, preferring the right shape. It need not fit the slide. Never repeats within a deck.
3. **No picture.** Only if even that is impossible.

Lookups run **alongside the writing**: the main search starts the moment the outline exists, each slide's pick the moment its text exists (`PictureSession`). Measured: 6 pictures in about 1.4 s (before: 30–60 s with vision checks).

Used only for decks made from a prompt. The editor's "AI picture" feature is separate (user-triggered, credits, plan limits).

## Rate limits and production

- Unsplash: **demo key 50 requests/hour; Production key 1000/hour** (apply once the app meets their guidelines — hotlinking, download ping, UTM: done; **attribution: the credit is stored on each picture but the on-slide label is switched off (`SHOW_PHOTO_CREDIT`, owner decision 2026-10-09) — resolve this before applying**). Searches **and** download pings count; the photo files (images.unsplash.com) do not.
- One 6-picture deck costs about 13 requests (6–7 searches + 6 pings): ~4 decks/hour on the demo key, ~75/hour on a Production key. When the quota is gone the library takes over — decks still finish, at the same speed.
- Settings: `UNSPLASH_HOURLY_LIMIT` (50 → set 1000 after approval; our own guard stops ~10% below it), `STOCK_USER_HOURLY` (30; one account cannot spend everyone's quota), optional `PEXELS_API_KEY` (a second source).
- Identical searches are served from memory for 30 minutes. The counters are per server process: with several API instances, give each a share of the limit or move the counters to a shared store (Redis) — Unsplash's own `403` is the backstop.
- Tests blank all stock keys, so they never spend quota.
