---
name: slide-layouts-and-document
description: The presentation document model, semantic slide content, deterministic layout engine and validators in SlidesDone — how to add a layout or element type, and how themes/aspect ratios/validation fit together. Use when changing slide rendering, layouts, themes, or the document schema.
---

# Document model & layout engine

- **Document** (`packages/validation/src/presentation.ts`): `Presentation { schemaVersion, theme, slides[], sources[] }`; slide = `{ id, layoutId, content?, elements[], speakerNotes, sources[], validation }`. Elements: text / image / shape / icon / chart / table / diagram, absolute coordinates in **canvas units** (`CANVAS`: 16:9 = 1920×1080, 4:3 = 1440×1080, 1:1 = 1080×1080).
- **Semantic content** (`slideContentSchema`, discriminated by `layout`): what the model writes. `composeSlide(content, theme, aspect)` (`packages/theme/src/layout.ts`) turns it into elements — pure/deterministic, text auto-fit via `text-metrics.ts`, card grids wrap on narrow canvases. The `content` is kept on the slide so layout swaps/theme changes re-run it without losing content.
- **Validators** (`validate.ts`): overflow estimate, WCAG contrast, tiny text, missing content, unresolved images, extreme image ratio, duplicate layouts (3 in a row), font fallback; `applyValidation()` writes status per slide; completeness score.
- **Themes** (`themes.ts`): 4 built-ins; every pair is contrast-checked by tests. Brand kit / per-slide overrides use `themeOverrides`.

## Add a layout
1. Add a variant to `slideContentSchema` (+ its id in `LAYOUT_IDS` if new). `GENERATABLE_LAYOUTS` derives automatically.
2. Add a `case` in `composeSlide` (use `text()`, `rect()`, `grid()`, `titleBlock()` helpers; never magic-number the canvas — use `W/H/M`).
3. Add a sample to `theme.test.ts` `SAMPLES` — the suite composes **every layout × every theme × every aspect ratio** and requires zero overflow/contrast errors.
4. Teach prompts (`ai/prompts.ts` slides schema list) and `mock-model.ts` about it.
5. Render support for any new element type in `apps/editor/src/components/slide/SlideCanvas.tsx` (and later the exporters).

## Rules
Models never output coordinates. Never store only HTML. Document changes by the editor go through commands/patches (undoable) — never mutate in place. Watermark is not part of the document.
