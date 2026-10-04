---
name: editor-architecture
description: How the promptToPpt browser editor works — document store with patch-based undo/redo, commands, interaction layer, autosave/conflict/versioning, plan gates in the UI, and how to add an editor feature safely. Use when changing anything under apps/editor/src/editor, components/editor, or the save/version API.
---

# Editor architecture

**Rendering: DOM** (not canvas/SVG) — native text editing, accessibility, easy export (ADR-001). Slide = fixed canvas units (1920×1080) scaled by CSS transform.

## State (two stores, never mixed)
- `editor/store.ts` — **document only** (`Presentation`) + history. Every change = `apply(label, recipe, {mergeKey?})` → immer `produceWithPatches` → patches + inverse patches. Undo/redo apply the inverse/forward patches (exact, no deck snapshots). Same `mergeKey` within 1 s merges into one undo step (typing, nudging). `seq` bumps on every change incl. undo/redo — autosave subscribes to it. No-op recipes record nothing.
- `editor/ui.ts` — transient UI (selection, editing id, drawer, clipboard). Never persisted.
- `editor/commands.ts` — **pure mutators over an immer draft** (move/resize/text/slides/theme/layout/AI). Add features here first, with a test in `editor.test.ts`. Gotchas learned: `structuredClone` throws on drafts (use `plain()`); recipes that reassign arrays always record a patch — guard no-ops; hand edits set `slide.manual` so theme/layout swaps keep user work.

## Interaction (`components/editor/EditorCanvas.tsx`)
Rendered slide is clipped; the **interaction layer is a sibling, NOT clipped** (handles must stay reachable when an element overhangs the slide). Drags/resizes use transient preview state and commit ONE command on pointer-up. Snapping: `snap()` (slide edges/centre + other elements, Alt disables). Text editing = contentEditable, commits plain text lines as one undoable edit on blur/Esc. Locked elements/slides refuse every mutation (also in the commands).

## Persistence (`editor/autosave.ts`, `routes/presentations.ts`)
`PUT /presentations/:id {baseRevision, document}` → **409 CONFLICT** if the revision moved. Debounced 1.5 s; flush on tab hide; offline → exponential backoff + localStorage backup (restored on next load if based on the same revision); BroadcastChannel syncs same-browser tabs; a stale *device* gets a conflict banner (Load latest / Keep mine). History: only the user's own recent autosave snapshot is mutated in place; generation/restore/AI-edit snapshots are immutable; restore adds a NEW version.

## Plan gates in the UI
Display only (`useEntitlements`, `requireAdvanced()` → UpgradeModal). Server enforces: slides cap + premium themes (on save), AI edit (Pro+, credits, locks), export, models. **Known soft gate:** "advanced editor" (move/resize/format) is UI-enforced only.

## Add an editor feature — checklist
command + unit test → UI wiring → (if paid) server gate + test → E2E assertion in the browser (Playwright from scratchpad) → docs. Keep `Escape`/focus behaviour correct in any new dialog (`useDialog`).
