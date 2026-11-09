# Authoring a Morph template

A Morph template is the choreography of a whole deck: what is on each slide ("scene"), where, how big, and which object on one scene is the **same object** on the next, so that moving to the next slide plays one continuous movement. Authored templates are written with `packages/theme/src/morph-templates/author.ts`. **Read `templates/pitch-orbit.ts` first: it is the reference for quality and for how to write one.**

## Files (one template = three files, nothing else)

| file | what |
|---|---|
| `packages/theme/src/morph-templates/templates/<id>.ts` | the template (replace the placeholder that already exists there; keep the exported constant name and the `id`) |
| `scripts/morph-art/<id>.mjs` | its artwork spec for the image generator (`export default (ctx) => [spec, ...]`) |
| `apps/web/public/morph-templates/<prefix>-*.webp` | the generated pictures (never commit hand-made or downloaded pictures) |

Do **not** edit shared files (`author.ts`, `compose.ts`, `types.ts`, `registry.ts`, `demos.ts`, `gen-morph-photos.mjs`, the web page, `MORPH_ART_VERSION`). If you need something they lack, write a small helper inside your template file, or say so in your report.

## The model

* `authored(meta, { objects, order, scenes })`. Every object is defined **once** in `objects`; each scene says where it is in `place`. Same id on two scenes = same object: the Morph moves it (position, size, rotation, opacity). Text that changes between scenes crossfades; a text whose `px` differs between scenes scales smoothly; an image whose `art` differs crossfades.
* An object missing from a scene leaves (fades) and later enters from the nearest edge. With `park: 'l'|'r'|'t'|'b'` it instead waits **off the slide** on that side between the scenes it is used on, so it glides in and out. Use `park` generously: it is what makes a deck feel choreographed.
* Scenes are named `s1…sN` in order. `order` is back to front. Canvas is 1920 × 1080.
* Helpers (import from `../author`): `rect, full, center, row, col, grid, at, off, fitIn, scale, W, H`. Shapes: `shape` = `rect` (default, with `radius`), `ellipse`, `ring`, `triangle`, `chevron`, `line`, or `poly` (corners 0-1); `fill`, `gradient`, `stroke/strokeW`; opacity per scene with `a`; per scene you can also change `color` (a text: old and new crossfade), `radius` (a shape or picture), `px` (a text: it scales), `fill`, `text`, `art`. Lines are thin rotated rects. Backgrounds per scene: `bg` colour or `grad`.
* Typography is **exact**: `px`, `weight`, `spc` (px tracking), `lh` (line height multiple), `align`, `caps`, `face: 'heading' | 'body'`. Nothing is auto-fitted: **size every text box yourself** (about 0.56 × px per character for sans, 0.62 for caps/wide faces; leave 10% spare) so nothing wraps unexpectedly or runs past its box.
* Only these fonts exist: Plus Jakarta Sans, Inter, Space Grotesk, Sora, Poppins, Montserrat, Lato, Outfit, DM Sans, Manrope, Playfair Display, Lora, DM Serif Display, Fraunces, Work Sans, Raleway, Nunito Sans, IBM Plex Sans, Merriweather, Source Serif 4, Bebas Neue, Oswald, Space Mono, Anton, Josefin Sans. Weights 400-800 (Anton/Bebas/DM Serif Display have one weight).
* The text you author is also the website demo (the live preview plays every scene with the words as written), so write **real, useful sample copy that fits the scenes and the pictures** (never lorem ipsum, never invented statistics presented as fact: mark sample numbers as sample).
* Object ids that are text are what the AI fills later (`fields[id]`). Name them for what they are (`title`, `body`, `stat`, `name1`…), and keep navigation/branding objects (`brand`, `page`) identical on every scene: they are treated as chrome.

## Choreography: make it advanced, not a slideshow

The movement is the product. Every scene change must be one visible, motivated movement of several objects. Techniques to combine (use at least four per template, and a different set from the other templates):

* **Zoom-through**: an object (a tile, a circle, a card) grows until it fills the slide and *becomes* the next scene's background; it later shrinks back to its place.
* **Camera pan**: a long strip of objects, and every scene shifts all of them left/up by one step so the next item arrives at centre while the current one shrinks and fades.
* **Carousel / stack**: cards slide sideways, or a stack where the top card flies off (move + rotate + `park`) to reveal the next.
* **Accordion / bento**: panels trade width and height; one expands, the others compress.
* **Hero object that travels**: one picture stays on every slide and moves, scales and rotates to a new place each time.
* **Shapes that become charts**: the same rounded rects/circles are cards on one scene, bars on the next, dots on a scatter after that.
* **Scale-morph typography**: one title object whose `px` goes from huge (cover) to small (header), or a giant numeral that travels.
* **Nested circles / rings** re-centring; **orbits** (satellites slide along a ring to new angles).
* **Ticker**: a very wide repeated phrase sliding behind the content.
* **Iris / spotlight**: a circle grows from a point to fill the slide with the next colour.
* **Connected graph**: nodes move, the links (thin rotated rects) re-computed by a helper in your file.
* **Colour blocks that re-flow**, parallax layers (background layer moves less than foreground), `a` fades that cross-dissolve one arrangement into another.

Rules: consecutive scenes must share **at least 3 objects**; do not move everything at once, give the eye a hero and a supporting cast; keep movement paths clear of text that is meant to be read; the first and last scenes should rhyme.

## Quality bar (check all before you say done)

* Looks like a premium, designed deck at a glance: strong hierarchy, generous margins (≥ 80 px), consistent grid, restrained palette (3-5 colours), one idea per slide, **nothing cropped, nothing overlapping text, nothing tiny** (body ≥ 26 px, captions ≥ 22 px). No emoji, no clip-art look.
* Typography with character that fits the theme (heading + body faces, deliberate weights, tracking on caps and on very large type, line height 1.0-1.1 for display, 1.4+ for body).
* Pictures: photographic or illustrated **art-directed to this theme**, all from the generator, consistent in lighting and palette across the template. Cut-outs are clean (no halos, no frame-sliced shapes). 6-14 pictures per template; shapes and type do the rest.
* Light/dark: follow the brief (the library must keep a mix).
* 10-14 scenes, covering a real deck: cover, contents/agenda, 6-9 content scenes of different kinds, a closing/contact scene.
* The demo copy fits the boxes and the pictures; sample numbers are labelled sample.

## Artwork

`scripts/morph-art/<id>.mjs` exports `(ctx) => specs`; `ctx` = `{ GREEN, MAGENTA, BLUE, BLACK, AD }` (background lines for key colours, and an advertising-photography style line). A spec:

```js
{ name: 'x-hero', key: 'green' | 'magenta' | 'blue' | 'black' | null, ratio: '1:1' | '4:5' | '3:4' | '2:3' | '4:3' | '3:2' | '16:9' | '21:9' | '9:16' | '5:4',
  size: [w, h],            // final pixels (scaled by cover or trim)
  mode: 'trim' | 'frame' | 'cover',
  fill: 0.9,               // trim: how much of the canvas the subject fills (leave headroom with < 1)
  anchor: 'bottom',        // trim: stand the subject on the bottom edge
  check: true, ground: true, // reject (and regenerate) a subject sliced by the frame (ground: its bottom may touch)
  p: 'prompt' }
```

* `key: null, mode: 'cover'`: a finished picture (photo, illustration, gradient field, texture). `key: 'black'`: a glow/orb/light/stripes on black; its own brightness becomes the transparency. `key: 'green'|'magenta'|'blue'`: a cut-out on a flat colour that is keyed out: **pick the key colour that does not occur in the subject** (green for most things, magenta for green things, blue for things with reds/oranges/greens and silver). `trim`: crops to the subject and places it on a canvas of `size`; `frame`: keeps the whole frame (scatters, glows).
* Names must start with your template's prefix (e.g. `orbit-`); the file is `apps/web/public/morph-templates/<name>.webp`. Reference it in the template as `art: '<name>.webp'`.
* Prompts: say exactly what is in frame, the lighting, the palette, "no text, no logo, no watermark", and for cut-outs "the whole subject inside the frame with a clear margin, nothing cropped". Avoid anything that looks like recitation of a known work (a refusal `IMAGE_RECITATION` means: rephrase more generically). People are allowed but must look natural; prefer products, objects, illustration, abstract and architecture where the brief allows.
* Generate: `node scripts/gen-morph-photos.mjs --only name1,name2,…` (about $0.13 per picture; 2 at a time). Redo a single weak one with `--only`. Do not generate more pictures than the template uses.

## Look at it (never trust a test for this)

```
node scripts/morph-preview.mjs <id>                    # every scene -> contact sheets (6 per sheet), path printed
node scripts/morph-preview.mjs <id> --transition N     # 7 frames of the Morph INTO scene N: judge the motion
```

Needs the dev servers already running (web :3100, editor :3001, API :4000). Open the printed PNGs with the image reader. Check **every** scene sheet and **at least three transitions** (the most ambitious ones). Fix and repeat until clean. Then run `pnpm --filter @prompttoppt/theme exec vitest run src/morph-templates`, `pnpm --filter @prompttoppt/api exec vitest run src/morph-template-assets.test.ts` and `cd packages/theme && pnpm exec tsc --noEmit`.

Never touch port 3000. Do not read or print API keys or `.env`. Do not commit.
