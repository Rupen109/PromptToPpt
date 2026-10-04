# Template direction v2 — "art-directed" templates (prototype for review)

## What the reference gallery does (presentations.ai, screenshots 2026-10-02)
- **Every thumbnail is image-led** — real photography (people at work, close-ups) or 3D objects (coins, letter blocks, devices), not text on a flat colour.
- **Photos are cropped into shapes**: circles, angled/parallelogram panels, tall side panels, full-bleed with a colour wash.
- **Colour blocking with one strong palette per template** (orange, magenta, deep teal, mustard, graphite), plus geometric accents (square grids, translucent diagonal bands, dots).
- **Typography mixes serif and sans**, large titles, tiny supporting copy.
- Every slide is composed differently — no repeated card grid.
(magicslides' gallery is behind a login; only the public page text was reachable.)

## Where ours was weaker
Our 120 catalogue designs are *theme kits applied to semantic layouts*: good and safe, but text on flat colour with decorative shapes, no imagery, one composition per layout. That caps how premium they can look.

## What the prototypes add (see `/template-lab` on the website)
| Capability | How |
|---|---|
| Photo crops | `image.clip`: `circle` · `arch` · `diagonal` · `diagonal-flip`, plus `radius` |
| Colour wash over photos | `image.overlay` (gradient, `#RRGGBBAA`) — keeps type readable on busy pictures |
| Ambient motion | new animations `kenburns` (slow photo zoom), `float`, `drift` — loop while the slide is on screen |
| Honest translucency | entrance keyframes now end at each element's own opacity (glass cards stay glass) |
| Tight titles | `paraGap` — multi-line titles no longer get half-a-line gaps |
| Art-direction kit | `packages/theme/src/templates/lab/dsl.ts` — place text, shapes, pills and photos on the 1920×1080 canvas |

Three decks, 5 slides each, 16 original AI-generated images (Vertex image model, ≈ $1 total): **Aurora** (Pitch & Investors, dark/mint), **Sunburst** (Marketing, orange/pink/yellow), **Scholar** (Education, cream/navy/gold).

## If approved — the rollout
1. **Imagery**: generate a shared photo/3D set *per category* (≈ 10–14 each) once, ship to our CDN; each template re-uses them with its own crops, washes and palette (so 120 templates ≠ 1,200 images).
2. **Engine**: promote the hand-composed slides into *semantic layouts with image slots* (title-photo, split-photo, circle spotlight, photo-metrics, gallery, quote-on-photo…), so the AI can still fill any template and the editor can still re-layout. Today these decks are fixed compositions (they are marked `manual` so edits never recompose them).
3. **Catalogue**: rebuild every design from the new kits; keep Starter's 3 free designs per category.
4. **Honesty**: sample text/numbers stay flagged as placeholders; photos are AI artwork, not real customers.
