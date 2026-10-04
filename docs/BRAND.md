# promptToPpt brand

## The mark
A bold **P** whose counter holds an **AI spark**, with an **orange cursor / slide-bar** under the bowl, on a **cobalt tile**. It reads as "prompt → presentation": the P is the prompt, the spark is the AI, the bar is the slide being written.

| Part | Colour | Token (`packages/theme/src/tokens.css`) |
|---|---|---|
| Tile | cobalt gradient `#2F63F5 → #0B3DD0 → #082A9A` | `--color-primary` |
| P | white | — |
| Spark | yellow `#FFDF00` | `--color-secondary` |
| Cursor bar | orange `#FF5722` | `--color-accent` |
| Wordmark | "gradient flow": light `prompt` in ink `#181B25` flowing into bold `ToPpt` that shifts from cobalt to orange (on dark: white `prompt`, lighter cobalt `#6C8FFF` → orange) | text / primary → accent |

Wordmark font: Sora — weight 300 for `prompt`, 800 for `ToPpt`, tracking −0.03em. The gradient uses brand colours only (`linear-gradient(90deg, cobalt 0–28%, orange 100%)`). Sora is loaded by the web app (`--font-logo`) and the editor (`index.html`). Always written `promptToPpt` (camel case), never "PromptToPPT" or "Prompt to PPT".

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
Sources are `scripts/brand/mark.svg` (rounded tile) and `mark-square.svg` (full-bleed, for the Apple touch icon). `scripts/brand/build.cjs` rasterises everything with Playwright (instructions in its header). If the mark changes, update `packages/ui/src/Logo.tsx`, both SVGs, regenerate, and replace the files in the two `public` folders.

## Landing-page UI kit (write once, reuse)
All motion lives in three components in `apps/web/components/ui/` — never hand-write button/card hover styles in a section:
- **`<Button variant size depth arrow loading pill block href>`** — the only CTA. Hard ink shadow that grows as it lifts on hover and presses flat on click, a light sweep over filled variants, an arrow that glides forward. Variants: `accent` `primary` `ink` `dark` `white` `yellow` `lime` `ghost` `soft` `softActive`. Pass `href` for a link.
- **`<Card tone shadow radius border hover reveal index>`** — the only card. Pastel tone (`white cream peach lavender mist yellow ink`), hard shadow, lift on hover, scroll-reveal with stagger (`index`). Put layout classes in `className`, layout of the reveal wrapper in `wrapperClassName`.
- **`<Reveal>`** — the scroll-reveal itself (used by `Card` and `SectionHeader`). CSS is in `app/globals.css`; content is simply visible without JavaScript or with `prefers-reduced-motion`.
Section-level pieces (`Section`, `Badge`, `Tag`, `Tile`, `SectionHeader`) are in `components/sections/ui.tsx`.
