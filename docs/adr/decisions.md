# ADR-001: Editor Rendering Architecture

**Date:** 2026-09-30
**Status:** Decided
**Decider:** Principal Architect

## Problem

We need to choose the rendering architecture for the slide canvas in the browser editor. Options are:
1. DOM-based (HTML + CSS)
2. SVG-based
3. Canvas (HTML5 Canvas / OffscreenCanvas)
4. Hybrid (DOM + Canvas)

## Decision

**DOM-based (HTML + CSS)** using CSS Grid/Flexbox for layout within fixed aspect-ratio containers.

## Why

| Criterion | DOM | SVG | Canvas |
|---|---|---|---|
| Inline text editing | ✅ Native | ⚠️ Complex | ❌ Custom |
| PPTX export fidelity | ✅ Good | ✅ Good | ⚠️ Pixel-only |
| Accessibility | ✅ Native | ⚠️ Partial | ❌ None |
| Precise positioning | ✅ CSS | ✅ SVG attrs | ✅ Pixels |
| Performance (large decks) | ⚠️ Virtualize | ⚠️ Virtualize | ✅ Best |
| Rich text | ✅ Tiptap | ❌ Hard | ❌ Custom |
| Image handling | ✅ img tags | ✅ image elem | ⚠️ drawImage |
| Snapshot for export | ✅ html2canvas | ✅ SVG serialize | ✅ toDataURL |

## Trade-offs

- Canvas would give better perf at very large decks but makes text editing impractical.
- SVG is good for diagrams but text editing is painful.
- DOM gives us Tiptap for rich text and native browser text selection — essential for a PPT editor.

## Migration Path

If performance becomes a bottleneck on very large decks (50+ slides with many elements), we can:
1. Virtualize the thumbnail rail (already planned).
2. Use OffscreenCanvas only for non-editable thumbnails.
3. Keep DOM for the active editing canvas.

---

# ADR-002: State Management for Editor

**Date:** 2026-09-30
**Status:** Decided

## Decision

**Zustand** for editor state.

## Why

- Zustand is lightweight (< 1KB), doesn't require boilerplate (no actions/reducers/selectors).
- Perfect for a slice-based editor state (slides, selection, history, UI state).
- Supports immer for immutable updates.
- Redux Toolkit was considered but is heavier; overkill for our model size.
- Jotai considered but atom granularity harder to manage for large composite state.

---

# ADR-003: API Framework

**Date:** 2026-09-30
**Status:** Decided

## Decision

**Hono** on Node.js 20 LTS.

## Why

- Hono is TypeScript-first, ultra-fast (fastest benchmark results), edge-compatible.
- Express was considered but lacks built-in TypeScript support and is slower.
- Fastify was considered but heavier configuration.
- Hono's middleware system matches our needs (cors, auth, rate limiting, logging).

---

# ADR-004: Database

**Date:** 2026-09-30
**Status:** Decided

## Decision

**PostgreSQL 16** via **AWS RDS** (Aurora Serverless v2 for cost efficiency at low scale).

## Cost at Scale

| MAU | RDS Cost/month |
|---|---|
| 1k | ~$30 (t3.micro) |
| 10k | ~$70 (t3.small) |
| 100k | ~$150 (t3.medium) |
| 1M | ~$500 (Aurora Serverless auto-scaling) |

## Why not DynamoDB

- Our data model is highly relational (users → subscriptions → presentations → slides → elements → versions).
- Analytics queries require JOINs and aggregations — DynamoDB would need duplicated data or expensive scans.
- Billing/ledger requires ACID transactions.
