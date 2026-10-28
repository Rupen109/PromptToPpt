# SlidesDone brand

## The mark
A white **slide** (a heading bar and two text lines) on a **cobalt tile**, with a yellow **"done" check badge** on its corner. It reads as "the slide is finished": the product's promise in one picture.

| Part | Colour | Token (`packages/theme/src/tokens.css`) |
|---|---|---|
| Tile | cobalt gradient `#2F63F5 → #0B3DD0 → #082A9A` | `--color-primary` |
| Slide | white, with a cobalt heading bar and pale-blue text lines | — |
| Check badge | yellow `#FFDF00` disc, cobalt ring and tick | `--color-secondary` |
| Wordmark end | orange `#FF5722` (the end of the gradient) | `--color-accent` |
| Wordmark | "gradient flow": light `Slides` in ink `#181B25` flowing into bold `Done` that shifts from cobalt to orange (on dark: white `Slides`, lighter cobalt `#6C8FFF` → orange) | text / primary / accent |

Wordmark font: Sora — weight 300 for `Slides`, 800 for `Done`, tracking −0.03em. The gradient uses brand colours only (`linear-gradient(90deg, cobalt 0–28%, orange 100%)`). Sora is loaded by the web app (`--font-logo`) and the editor (`index.html`). Always written `SlidesDone` (camel case), never "PromptToPPT" or "Prompt to PPT".

## Use it in code
```tsx
import { Logo, LogoMark } from '@prompttoppt/ui/logo'   // subpath import: safe in server components
<Logo size={34} />                 // mark + gradient-flow wordmark (size = mark height)
<Logo size={44} tone="dark" />     // on dark backgrounds
<LogoMark size={32} />             // mark only (avatars, tight spaces)
```
Used in: website header, footer and login/signup; editor sidebar. Static files in `apps/web/public`: `favicon.svg/.ico`, `favicon-16x16/32x32.png`, `apple-touch-icon.png`, `android-chrome-192/512.png`, `og-image.png` (1200×630 social card), `logo-mark.svg`, `logo-lockup.png` / `logo-lockup-dark.png` (2× PNG), `site.webmanifest`. The editor has its own favicon set in `apps/editor/public`.

## Rules
- Clear space around the mark: at least ¼ of its height. Minimum size: 16 px (mark only), 24 px height with wordmark.
- Don't recolour, stretch, rotate, add effects, or put the tile on a busy photo (use `tone="dark"` on dark/blue surfaces, the plain tile on white).
- The tile is already high-contrast on both white and ink backgrounds; no separate "reversed" mark is needed.

## Regenerating the PNGs
The mark's source of truth is `packages/ui/src/Logo.tsx` (`apps/web/public/favicon.svg` is the same drawing). Everything else is generated from it by `node e2e/make-brand-assets.mjs` (Playwright; needs network for the Sora/Inter fonts): favicons (`.ico`, 16/32 px), app icons (180/192/512 px), the two logo lock-ups and the 1200×630 social card, written to `apps/web/public`, `apps/web/app/favicon.ico` and `apps/editor/public`. Change the mark in both places, run the script, commit the results.