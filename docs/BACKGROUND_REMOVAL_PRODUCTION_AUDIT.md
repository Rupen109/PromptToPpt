# Background removal editor: production readiness audit (2026-11-19)

**Scope:** audit and plan only. No application code was changed, nothing was committed or deployed. No new model was downloaded or run.
**Verdict:** the editor *shell* (dialog, mask editing, undo/redo, export) is in good shape. It is **not production-ready**, for reasons that are mostly *outside* the editor: there is no commercially cleared model or provider, and there is no production place to run inference. Inside the editor there are a handful of real defects and quality gaps, listed in section 2.

How to read the evidence tags used below:
- **[code]** read in the source, not executed. **[run]** observed in a real run (suite 83, Chromium on macOS, real server model). **[static]** inspected from files (binaries, config). **[web]** from a cited web page, one source. **[estimate]** my arithmetic, not measured. **[untested]** nobody has run it.

---

## 1. Current architecture assessment

### 1.1 Components (all dev-only; production bundle verified to contain none of them)
| Layer | File | What it does | State |
|---|---|---|---|
| Contract | `apps/editor/src/lib/bgremoval/types.ts` | `SegmentationProvider.segment(input, {signal, onProgress}) -> ForegroundMask` (0-255, any size) | Good. Too thin for production (section 3.1) |
| Provider | `lib/bgremoval/providers/server.ts`, `providers/index.ts` | Dev-only: POST `/images/cutout-mask`, reads a grey PNG. `index.ts` returns it only when `import.meta.env.DEV` | Works. The only provider |
| Orchestration | `lib/bgremoval/useBackgroundRemoval.ts` | fetch original bytes, validate (25 MP / 10 000 px), decode, own-alpha shortcut, provider, resample, build `MaskEditor` + `Renderer`; abort/retry/cleanup | Solid; a few gaps below |
| Mask editing | `lib/bgremoval/mask.ts` | immutable base, `cur` copy, soft brush with min/max, 64 px tile patches, history capped at 96 MB / 200 entries, `reset()` as an undoable step, exact `isEdited` | Solid [run + 23 unit tests] |
| Rendering | `lib/bgremoval/renderer.ts` | picture as ImageBitmap + RGBA "mask canvas" updated per dirty rect; `destination-in` compositing on a viewport-sized scratch canvas; checkerboard; compare | Works; memory-heavy at 25 MP |
| Pixel work | `lib/bgremoval/worker.ts`, `workerClient.ts` | worker ops `resample`, `transparency`, `export` (decode, decontaminate edge colours, compose, PNG via `OffscreenCanvas.convertToBlob`); one worker per dialog, terminated on close | Works; no memory ceiling check |
| Edge colour / compose | `lib/bgremoval/composite.ts` | `foregroundColors` (3x3 average of solid neighbours, up to 8 passes), `compose` | Good idea, fixed pass count is a defect (B-5) |
| Mask resample | `lib/bgremoval/resample.ts` | bilinear | The quality ceiling (section 4) |
| UI | `components/editor/bgremoval/BackgroundRemovalDialog.tsx`, `MaskStage.tsx` | tools, brush, history, zoom, backgrounds, compare, download, apply; stage owns pointer/zoom/pan in refs | Works on desktop; touch is incomplete |
| Server | `services/api/src/media/cutout.ts`, `cutout-picture.ts`, `routes/editor-media.ts` | BiRefNet-lite 1024 via Transformers.js + onnxruntime-node; endpoints `cutout`, `cutout-mask`, `original` all behind `refuseIfOff('background_removal')` + auth + per-user rate limit | Dev only |
| Flags | `flags/registry.ts`, `flags/flags.ts`, `env.ts` | `background_removal` default on only outside production; hard gate `backgroundRemovalBlocked` plus `BACKGROUND_REMOVAL_APPROVED` | Correct, but a single global boolean (see 3.4) |
| Assistant | `routes/presentations.ts`, `assistant/*` | "remove the background of this picture" runs the server model, gated by `isFlagOn('background_removal')`; Morph slides refuse | Separate code path, same model, same gate |

### 1.2 Pipeline as it really runs [code + run]
1. Client POSTs `images/original` (our own bytes; avoids cross-origin) and decodes with `createImageBitmap(..., from-image)`.
2. Format/size check: PNG/JPEG/WebP only, `w*h <= 25 MP`, `max side <= 10 000`.
3. Worker `transparency`: draws the picture to an OffscreenCanvas, scans alpha. If more than 2% of pixels are below 250, the picture's own alpha becomes the mask and an opaque copy is shown (no provider call).
4. Otherwise `provider.segment` -> server: sharp decodes + auto-rotates + shrinks to <= 2048 px, model runs on a **fixed 1024x1024** input, sigmoid x 255 truncated to uint8, resized to working size with the library's bilinear resize, grey PNG returned.
5. Worker `resample`: bilinear to the picture's own size. `MaskEditor` is built, `Renderer` allocates canvases.
6. Export (worker): decode original, draw to canvas, `getImageData`, `foregroundColors`, `compose`, `putImageData`, `convertToBlob`. Straight alpha, original size.

### 1.3 Things that are *better* than the previous limitation list suggested
- **Already-transparent pictures work** without a model call [run, plus a direct check this session: opens with canvas, no error, no `cutout-mask` request]. The old "422 on transparent input" is gone.
- **Reset/undo** are exact, bounded and re-inference-free [run + unit tests].
- **Cleanup is mostly right:** worker terminated on close; `Renderer.dispose` zeroes canvases and closes the bitmap; background-picture bitmap closed on change/unmount; download object URL revoked after 15 s; abort controller cancels the fetch. No leak found by reading [code]; not yet measured over repeated sessions [untested].
- **"Strokes as editable operations"** is only half true: undo/redo store pixel *patches*, not parametric strokes. That is fine at a single resolution and cheaper; it only matters if we later want to replay strokes at another resolution. Not a blocker.

---

## 2. Production blockers, by severity

### Severity A: blocks release
| # | Blocker | Evidence | Why it blocks |
|---|---|---|---|
| A-1 | **No commercially cleared model or provider.** | `docs/BACKGROUND_REMOVAL_EVALUATION.md` section 1: BiRefNet/IS-Net/BEN2/InSPyReNet carry the DIS5K non-commercial-data concern; BRIA needs a paid agreement; IMG.LY is AGPL; withoutBG Open is the cleanest trail found but is not clean (BiRefNet branch, DINOv3 licence, ~1.5 GB). | Owner rule: no unapproved model in production. This is a business/legal decision, not code. |
| A-2 | **No production place to run inference.** Alpine image cannot load `onnxruntime-node`; **and even on glibc the memory does not fit** (BiRefNet-lite 1024 peaks 2.4-4.4 GB [measured earlier, macOS], the planned server is a 2 GB `t4g.small`, API container limit 420 MB). | Section 3.3. | Fixing libc alone does not make it deployable. |
| A-3 | **Browser inference is not viable with the models evaluated.** 512 exports gave poor/empty masks on CPU and *no* foreground on WebGPU; 1024 OOMs in WASM; browser RAM 2.4-3.4 GB. | Evaluation doc section 2 (macOS Chromium only). | The "browser ONNX" provider has no usable model today. |

### Severity B: real defects in the shipped editor (fix before any release)
| # | Defect | Evidence | Effect |
|---|---|---|---|
| B-1 | **Server timeout does not stop the model, and releases the queue.** `alone()` chains on `run.catch`, and `Promise.race` rejects at 120 s while `e.mask()` keeps running. The next job starts immediately. | `media/cutout.ts` lines 51-56, 96-100 [code] | Two ~4 GB inferences at once, an out-of-memory kill of the API process. Also the client's abort cancels only the fetch, not the server work. |
| B-2 | **25 MP exceeds the canvas limit on iOS Safari.** Historically 16,777,216 px per canvas; one 2025 test suggests iOS 18 raised it to 8192x8192, unconfirmed. Over the limit the 2D context silently draws nothing; our `catch` for "needs more memory" never fires because nothing throws. `Renderer.syncMask` returns quietly when `getContext` is null. | [web] pqina.nl, lionpuro.com (links in section 5); code paths in `renderer.ts` 25-27, `worker.ts` 25-26 [code] | On iPhones/old iPads: blank preview or blank export. **Untested on a device.** |
| B-3 | **Two-finger touch paints.** Every `pointerdown` starts a stroke (no `isPrimary`/pointerId tracking); a second finger calls `beginStroke`, which ends the first; `up` of either finger ends the active one. `touch-action:none` removes the browser's own pinch. | `MaskStage.tsx` 120-152 [code] | Pinch/pan on a phone damages the mask. Mobile cannot ship. |
| B-4 | **Space key is swallowed everywhere.** The window `keydown` handler calls `preventDefault()` for Space whenever the target is not an input. | `MaskStage.tsx` 163 [code] | In Chromium that blocks Space activating a focused button/radio in the dialog (keyboard accessibility regression). Firefox quirk differs. To verify in a browser. |
| B-5 | **Edge-colour clean-up has a fixed 8 passes.** The transition band of the mask grows with the upscale factor (1024 -> 5000 px is about 5x), so on large pictures semi-transparent pixels further than 8 px from solid keep their contaminated colour. | `composite.ts` `passes = 8` [code]. Reasoned, not yet shown on an image [untested]. | Halos on large pictures and on hair. |
| B-6 | **Preview is not what is exported.** The preview cuts the raw picture with the mask; only the export runs `foregroundColors`. | `renderer.ts` vs `worker.ts` [code] | People judge fringes on a preview that still has them, or the reverse, and the export looks different from what they edited. |
| B-7 | **Subject core never reaches full opacity.** The server truncates `sigmoid*255` and the pipeline never normalises. Real export of a coffee photo: only **71** pixels were exactly 255, **160,944** were >= 250, 1,616,438 were 0 (of 1,800,000). | Suite 83 debug run [run] | A 1-2% see-through core on a transparent PNG placed over a slide. Fix is a gentle levels curve, not a threshold (section 4.2). |
| B-8 | **Memory at the limit is estimated, never measured.** At 25 MP (5000x5000): main thread holds bitmap ~100 MB + RGBA mask canvas ~100 MB (4 bytes per mask pixel, only alpha is used) + base+current 50 MB + up to 96 MB history; the export worker holds `getImageData` 100 MB + canvas 100 MB + alpha copy 25 MB + foreground RGB 75 MB + output 100 MB + JS arrays of edge pixels. | [estimate] ~350-450 MB main, ~500-600 MB worker transient | Likely fine on desktop, likely fatal on phones. Needs measurement (section 6). |
| B-9 | **`/images/original` is gated by the background-removal flag**, yet it is a generic "give me my picture's bytes" endpoint that any browser or commercial provider will need. | `routes/editor-media.ts` 101-111 [code] | Coupling the provider-independent plumbing to one feature flag. |

### Severity C: should fix, will not block
- C-1 Redundant decoding: the picture is decoded on the main thread, again in the worker for `transparency` (full draw + `getImageData` even for an ordinary photo), and again at export. At 25 MP that is seconds of avoidable work.
- C-2 `Renderer.syncMask` full pass runs on the main thread (25 M iterations on first load, 128-row bands).
- C-3 Plain mouse wheel pans; only Ctrl/Cmd+wheel zooms (documented in the UI). Most mouse users expect wheel = zoom.
- C-4 No keyboard path for painting; the stage is pointer only (a11y limitation to document).
- C-5 The canvas size uses `round(cssWidth*dpr)`, and pointer maths uses `dpr` rather than the real `canvas.width / rect.width`; error is sub-pixel but not zero at fractional DPR. DPR change (moving windows between monitors) is not observed.
- C-6 Brush has no stroke stabiliser; coalesced events + linear interpolation are used (fine).
- C-7 `rateLimit` is per instance memory (documented in `middleware/rate-limit.ts`); `waiting` counter in `cutout-picture.ts` is per process. Fine for one task, wrong for several.
- C-8 `original` endpoint labels any non-PNG/JPEG as WebP (magic-byte sniff of two formats only).

---

## 3. Recommended inference architecture

### 3.1 Provider contract (extend, do not replace, `types.ts`)
Keep `segment()` returning a mask so the dialog never changes. Add metadata and lifecycle so a registry can decide *whether a provider may run*, and so the UI can be honest about privacy:

```ts
export type ProviderKind = 'browser-onnx' | 'commercial-api' | 'self-hosted' | 'mock'

export interface ProviderCapabilities {
  kind: ProviderKind
  /** pixels this provider accepts; the dialog resizes or refuses before calling */
  maxInputPixels: number
  /** true when the picture leaves the person's device (drives a consent line in the dialog) */
  imageLeavesDevice: boolean
  /** the matte's native resolution, to choose the refinement step */
  nativeMaskSide: number
  /** soft alpha matte (hair) or hard binary mask */
  maskKind: 'matte' | 'binary'
}

/** Release gate: a production build may only register a provider that carries this record. */
export interface ProviderApproval { approvedBy: string; approvedAt: string; evidence: string /* path or URL of the licence/terms review */ }

export type ProviderErrorCode = 'unsupported' | 'too-large' | 'no-subject' | 'busy' | 'quota' | 'network' | 'unavailable' | 'aborted' | 'bad-output'
export class ProviderError extends Error { constructor(readonly code: ProviderErrorCode, message: string, readonly retryable = false) { super(message) } }

export interface SegmentationProvider {
  readonly id: string
  readonly label: string
  readonly capabilities: ProviderCapabilities
  readonly approval?: ProviderApproval            // absent => development builds only
  warmUp?(opts?: SegmentOptions): Promise<void>   // load weights / ping the endpoint, with progress
  segment(input: SegmentInput, opts?: SegmentOptions): Promise<ForegroundMask>
  dispose?(): void                                // free sessions, GPU buffers
}
```

Adapters, all returning `ForegroundMask`:
- **Cut-out adapter:** many commercial APIs return a cut-out PNG, not a mask. The adapter reads the alpha (same worker `transparency` op already written), **verifies the returned size/aspect equals the input** (APIs often crop or downscale; reject `bad-output` otherwise), and returns that alpha.
- **Mock provider (dev only):** deterministic mask (ellipse or luminance threshold) so UI/e2e/CI need no model, no cost. Lives under `providers/mock.ts`, excluded from production like `server.ts`.

### 3.2 Four provider shapes
| Provider | Where it runs | Needs | Status |
|---|---|---|---|
| Browser ONNX | Worker, `onnxruntime-web` (WebGPU, WASM fallback) | an approved model that fits phones (<~300 MB, <~1 GB RAM) and a quality gate | **No candidate** (A-3) |
| Commercial API | Our API proxies the vendor; the browser never sees the key | approved vendor + DPA; credit cost per call; timeout, retry, circuit breaker | Vendor not chosen |
| Self-hosted | Separate glibc service (Debian-slim container or Lambda container image) called by our API | approved weights; memory sized for the model; private network | Blocked by A-1 |
| Mock | Dev/CI only | nothing | Cheap, build first |

### 3.3 Why `onnxruntime-node` cannot load in production (root cause)
**Not bundling, not an Edge runtime, not deployment config. It is a libc mismatch: the package ships only glibc binaries and our image is musl.**

Evidence:
1. **Not Edge [static].** The model code is in `services/api` (Hono + `@hono/node-server`), a long-running Node 22 process in Docker behind Caddy on EC2 (`services/api/Dockerfile`, `infra/tofu/server.tf`). Native modules are supported there: `sharp` (libvips) is native and loads on the same image; `docker-check.mjs` proves it at build time.
2. **Not bundling [static].** `tsup.config.ts` bundles only `@prompttoppt/*`; third-party packages stay external, so `onnxruntime-node` is loaded from `node_modules` as a normal native addon. Nothing inlines or breaks the `.node` file.
3. **Binary inspection [static].** `onnxruntime-node@1.30.0/bin/napi-v6/` contains only `linux/{x64,arm64}`, `darwin/arm64`, `win32/{x64,arm64}`: **no musl build exists in the package.** Inspecting `linux/arm64/onnxruntime_binding.node` and `libonnxruntime.so.1`: dynamic loader `ld-linux-aarch64.so.1`, versioned symbols up to `GLIBC_2.28`, `libstdc++.so.6`, `libgcc_s.so.1`, `libc.so.6`. Alpine provides `ld-musl-aarch64.so.1` and no `ld-linux-aarch64.so.1`.
4. **Recorded failure [earlier run, recorded in `docs/REMOVE_BACKGROUND.md`].** On `node:22.23.5-alpine3.24`: "Error loading shared library ld-linux-aarch64.so.1". Adding `gcompat` + `libstdc++` fails with `__sprintf_chk: symbol not found`: that is a glibc fortify symbol musl does not implement, so a shim is not a fix. **Not re-run today: the Docker daemon is not running on this machine.** The static evidence above is consistent with the recorded error; a container re-run (Debian-slim passes / Alpine fails) is the cheap final confirmation.
5. **Platform compatibility:** Apple Silicon dev works because `darwin/arm64` is shipped. `linux/arm64` glibc works on Debian/Ubuntu/Amazon Linux. Only musl is excluded.

Consequences: (a) a Debian-slim base for the *whole* API image would fix loading but swells the image and changes the sharp/ffmpeg build we validated; (b) the structural option is a **separate inference container** (glibc) so the API image stays Alpine; (c) **memory is the bigger problem**: the model's 1024x1024 fixed input gives a 2.4-4.4 GB peak [measured earlier], versus 2 GB on the planned instance. Resolving libc without resolving memory yields an image that loads and then is killed.

### 3.4 Production gating (replace the single boolean)
Today: `BACKGROUND_REMOVAL_APPROVED=true` turns the feature on for *whatever* provider is wired. Replace with a named allow-list: `BACKGROUND_REMOVAL_PROVIDER=<id>` and a server table `APPROVED_PROVIDERS = { id: { evidence, approvedAt } }` that only an owner-approved commit can change. The client registry then refuses any provider without an `approval` record in a production build. This makes "do not enable an unapproved provider in production" a property of the code instead of a habit.

---

## 4. Image quality: findings and options

### 4.1 Where quality is lost today [code + run]
1. Model sees **1024x1024 regardless of picture size**, non-aspect-preserving; the matte's true detail is 1024 px.
2. Server upsizes 1024 -> working size (<= 2048) with the library's bilinear resize, then the client upsizes again to the original. Two bilinear steps; hair strands narrower than ~2 model pixels are already gone before our code sees them.
3. `resampleMask` is plain bilinear; at 5x it produces a wide, soft ramp (blurs fine edges, thickens thin ones).
4. No alpha normalisation (B-7).
5. `foregroundColors` fixed 8 passes (B-5), 3x3 averaging blurs colour.

### 4.2 Options (none applied; test each against the set in section 6.2)
| Topic | Option | Notes |
|---|---|---|
| Higher-quality upscale | **Guided / joint-bilateral upsampling using the original picture as guide** (a "guided filter" matte refinement) in the worker | Edges snap to real image edges; standard, model-independent, runs on any provider's mask. Best first investment. Cost: a few box-filter passes (O(n)); fine in a worker. |
| | Two-stage model on crops | Needs a model; blocked by A-1. |
| | Lanczos/bicubic instead of bilinear | Cheap, small gain, can ring (overshoot): clamp. |
| Full opacity | **Levels curve with smooth ends**, e.g. below ~6 -> 0, above ~245 -> 255, smoothstep between | Must not become a hard threshold; keep the originals in `base` for Reset, or apply to the provider mask before it becomes `base` (decide: "Reset to the AI mask" should mean the normalised one). |
| Hair / fine edges | Guided refinement (above) + keep wide soft band where model is uncertain; optional "refine edge" brush that raises local resolution of the matte | Verify visually on a hair set; do not post-threshold. |
| Halo / fringe | Replace fixed passes with **distance-scaled** passes (>= 2 x upscale factor + 2) or a proper foreground estimation (closed-form / multilevel foreground estimation) | The current idea is sound; the fixed count is the defect. Also run it in the preview (B-6) at preview resolution. |
| Feathering | Gaussian blur of alpha with radius 0-5 px *at original resolution*, applied after normalisation, user-controlled | Operates on `cur`, so it must be one undoable operation (like `reset`). |
| Expand / contract | Alpha dilate/erode (min/max filter, radius 1-10 px) as undoable ops | Classic "shift edge" control; also fixes a slightly loose model matte. |
| Original-resolution rendering | Already true for export (mask is full size). Preview at high zoom shows nearest-neighbour pixels (deliberate). | Add a toggle to preview the *decontaminated* result (B-6). |

---

## 5. Editor improvements: plan

All in `MaskStage.tsx` unless noted. Design rule: **one gesture state machine** keyed by `pointerId`, replacing the boolean flags.

1. **Pointer tracking:** keep a `Map<pointerId, {x,y}>`. One pointer + paint tool = stroke. Two pointers = cancel the active stroke *without committing it* (add `MaskEditor.cancelStroke()` that restores the `before` tiles) and switch to pinch/pan. This fixes B-3.
2. **Pinch zoom + two-finger pan:** from the two pointers' distance and midpoint, call the existing `zoomAt(factor, cx, cy)` and translate. Preserve the anchor under the fingers.
3. **Wheel:** `ctrlKey` (trackpad pinch and Ctrl+wheel) = zoom; plain wheel on a mouse (`deltaMode` line, or large integer `deltaY`, no `deltaX`) = zoom; trackpad two-finger scroll (small fractional deltas) = pan. Heuristic is imperfect: expose a "Wheel: zoom / pan" preference rather than guessing silently.
4. **Space+drag pan:** exists; fix B-4 by calling `preventDefault` only when the stage (or body) has focus and the target is not a button/radio/slider/link.
5. **Fit / reset zoom:** exist (`Fit`, `100%`). Add keyboard shortcuts (`0` fit, `1` 100%), and re-fit on dialog resize if the user has not zoomed.
6. **Brush accuracy:** compute `k = canvas.width / rect.width` per event instead of `dpr`; observe `devicePixelRatio` changes (`matchMedia('(resolution: ...)')`); unit-test `toImage` as a pure function at several zoom/DPR values (add to `renderer` or a new `view.ts` so it is testable).
7. **Smooth brush:** optional stabiliser (exponential smoothing of the pointer position, 0-100%), pressure for pen (`e.pressure` scales radius), hardness preview ring.
8. **Responsive layout:** desktop keeps the side panel. Phone: tools in a bottom sheet under the canvas, 44 px touch targets, brush size slider large, Apply/Download in a sticky footer. Current layout already stacks (`flex-col md:flex-row`, panel `max-h-[42%]`), which leaves the canvas small on phones in landscape; needs a device pass.
9. **Keyboard/a11y:** documented limitation for painting; keep ARIA for all non-painting controls; add focus trap check (`useDialog`).

---

## 6. Performance, reliability, and test strategy

### 6.1 Investigation items and what we know
| Topic | Known | To measure |
|---|---|---|
| OffscreenCanvas + Worker support | `convertToBlob` in Safari from 16.4 (2D only; WebP option not supported in Safari: we use PNG) [web caniuse/MDN] | Feature-detect at open; fall back to main-thread canvas export with a clear "may be slow" notice |
| 25 MP limit | Arbitrary; not tied to a measurement. Canvas limits differ by browser (section 2, B-2) | Peak RAM at 4, 12, 25 MP on a mid phone, a low-end laptop, desktop. Then set `MAX_PIXELS` per device class (`navigator.deviceMemory` where present, else conservative) |
| Browser memory | Estimates in B-8 | Chrome task manager / `performance.measureUserAgentSpecificMemory()` over 20 open/close cycles |
| GPU resource cleanup | Canvases zeroed, bitmaps closed. No WebGL/WebGPU in the editor itself, so only a future browser provider adds GPU buffers (`dispose()` in the contract) | Check GPU memory after 20 sessions once a browser provider exists |
| ImageBitmap / object URLs | Closed in `Renderer.dispose`, bg-image change, unmount; object URL revoked after 15 s | Heap snapshot after close: zero retained bitmaps/blobs |
| Multiple processing | The dialog's `busy` blocks double Download/Apply; `useBackgroundRemoval` aborts on re-run. Server serialises with `alone()` + max 6 waiting | Fix B-1; add server `AbortSignal` plumbing so a client cancel really frees the slot |
| CPU fallback | n/a until a browser provider exists (WebGPU -> WASM, with a *quality* check: the evaluation found WebGPU output empty while WASM was merely poor) | Never show a GPU result without a sanity check (foreground share within a plausible range; otherwise retry on WASM) |
| Failure recovery | Errors map to messages, retry, cancel, close; worker `onerror` fails all pending | Add: worker crash during export keeps the editor state (mask is on the main thread, so it does); test by killing the worker |

### 6.2 Test plan
**Image set (licensed or our own; do not use research datasets with non-commercial terms as a test oracle without reading their licence):** 12+ per class: people (side/back/groups), **hair and fur** (curly, flyaway, backlit), animals, products (glossy, glass, white-on-white, black-on-black), complex/cluttered backgrounds, low contrast, text/logos, plus **transparent PNG** input, already-cut-out, tiny (64 px), typical (2-12 MP), **25 MP**, extreme aspect (10000x200), EXIF-rotated, CMYK/ICC-profiled JPEG, animated GIF/APNG (must be refused), HEIC/AVIF/SVG (refused with the right message), corrupted/truncated files, a zero-byte file, a decompression-bomb PNG.

**Automated:** unit (existing 23 + normalisation, guided refinement, distance-scaled decontamination, `cancelStroke`, `toImage` at zoom/DPR); component (gesture state machine with synthetic pointer events: 1 finger paints, 2 fingers never paint, pinch zooms about the midpoint); e2e (suite 83 + mock-provider variant that runs in CI without a model); memory (Playwright + CDP heap snapshots over 20 cycles).

**Manual device pass, record results in the matrix below.**

### 6.3 Compatibility matrix (nothing below is tested today except the first row)
| Platform | Browser | Dialog | Worker + OffscreenCanvas export | Pinch/touch | WebGPU provider | WASM fallback | Status |
|---|---|---|---|---|---|---|---|
| macOS | Chrome (Chromium) | yes | yes | n/a | not run (provider unusable) | n/a | **Tested by suite 83 (headless Chromium)** |
| macOS | Safari | ? | needs 16.4+ | n/a | ? | ? | untested |
| macOS | Firefox | ? | ? | n/a | ? | ? | untested |
| Windows | Chrome, Edge | ? | expected yes | ? | ? | ? | untested |
| Windows | Firefox | ? | ? | ? | ? | ? | untested |
| Android | Chrome | ? | expected yes | **broken today (B-3)** | ? | ? | untested |
| iOS / iPadOS | Safari | ? | needs 16.4+, **canvas-area limit (B-2)** | **broken today (B-3)** | ? | ? | untested |

### 6.4 Proposed acceptance criteria (targets for the owner to confirm; none is a measured fact)
- **Quality:** on the internal set, mean boundary F-score vs hand-made masks >= 0.90 and no image below 0.75; on the hair subset, no visible halo at 200% zoom in 95% of images by two reviewers; foreground core alpha >= 254 for >= 99% of pixels the model calls certain; zero images where the export differs visibly from the preview.
- **Latency (12 MP, mid-range device):** first mask p95 <= 10 s (server or API) / <= 15 s (browser, after warm model); brush stroke frame time p95 <= 16 ms at 12 MP; no main-thread long task > 100 ms during a stroke; export p95 <= 5 s.
- **Memory:** peak tab memory at 12 MP <= 1.2 GB desktop, <= 600 MB on the lowest supported phone; heap growth after 20 open/close cycles <= 5%; no retained `ImageBitmap`/`Blob` after close.
- **Reliability:** 0 crashes in 200 mixed-image runs per supported browser; every error path (cancel, offline, 4xx/5xx, worker crash, aborted download) leaves the slide unchanged and the editor usable.
- **Correctness of export:** size == original (unless the slide-placement limit forces a downscale, then labelled), alpha present, straight alpha, corners transparent when the mask says so, white background opaque.
- **Cost/abuse:** per-user rate limit enforced; a cost ceiling per call; vendor outage falls back to a clear message, never to an unapproved provider.

---

## 7. Security and commercial readiness

### 7.1 Technical controls: what exists vs what is missing
| Area | Today | Gap |
|---|---|---|
| Authentication | `requireAuth` on all three endpoints; `resolveAccess(deckId, user)`; bytes read only for the *owner's* assets or two fixed template paths on our own origin | None found. Keep the owner-scoping when a vendor is added |
| File validation | Client: type allow-list, 25 MP, 10 000 px. Server: sharp with `limitInputPixels` 50 MP and `failOn: 'error'`; stored assets were validated at upload (8 MB) | The server accepts up to 50 MP while the client stops at 25 MP: align. Add a server-side format allow-list (no GIF/SVG/animated) and a decompression-bomb test |
| Rate limiting | 60/h `cutout*`, 240/h `original`, per user, **in memory per instance** | Shared store before a second instance (C-7). Add a per-user concurrent-job cap |
| Abuse/cost | Server serial queue, max 6 waiting, 120 s timeout | B-1; add credit cost or daily cap before any paid provider |
| Provider key protection | n/a today (no external provider) | Keys only in server env/secret store, never in the editor bundle, never logged; vendor calls only from the API; separate key per environment; rotate on staff change |
| Temporary image retention | Mask endpoint stores nothing; `cutout` stores the result as the owner's asset | For any vendor: contractual zero/short retention, no training on our data, deletion on request; never put picture URLs (even signed) in logs |
| User image privacy | Today the picture never leaves our servers | Any commercial API changes the privacy statement (images go to a sub-processor). Needs a consent line when `imageLeavesDevice`, a sub-processor list entry, and policy text |
| Output rights | n/a | Confirm the vendor/model grants commercial rights on outputs |

### 7.2 Commercial licensing checklist (nothing below is "done"; do not claim clearance)
For **each** candidate (model or vendor) fill every line with evidence (link/path + date + who read it):
- [ ] Code licence (file read, not a badge) and *attribution requirements*
- [ ] **Weights licence** (separate from code), version/revision pinned
- [ ] **Training-data licences** for every dataset named, including datasets named only in a paper; written legal opinion where terms may reach trained weights (the DIS5K clause is the open example)
- [ ] Backbone/pretrained-component licences (e.g. DINOv3 terms for withoutBG)
- [ ] Commercial use of **outputs** is permitted
- [ ] Redistribution rights if weights are shipped to browsers (shipping = distribution)
- [ ] For vendors: pricing at our volume, rate limits, SLA, region, **DPA**, sub-processors, retention, training-on-customer-data clause, breach notice, exit/data-deletion terms, whether images are logged
- [ ] Export/prohibited-use terms
- [ ] Review date and a re-review trigger (model/revision change)
- [ ] Owner sign-off recorded in `ProviderApproval.evidence`

Current status per `BACKGROUND_REMOVAL_EVALUATION.md`: **no candidate satisfies this list.** The owner's standing options: legal advice on the BiRefNet-class risk; a paid BRIA or IMG.LY licence; a paid API; closer look at withoutBG; Gemini/credits as a fallback after reading terms.

---

## 8. Recommended strategy

1. **Make the editor model-independent and approval-gated now** (cheap, no licence needed): mock provider, contract extension, approval-gated registry, fix the Severity B defects, quality pipeline (normalisation + guided refinement + distance-scaled decontamination). All of this improves *whichever* provider is chosen.
2. **Pick the first production provider by risk, not by cleverness:** a **commercial API behind our API** is the fastest legal path (their terms, their training-data risk, a DPA, no 4 GB memory on our server, no libc problem). Self-hosted needs an approved model *and* a separate glibc service sized for memory. Browser ONNX has no usable model today.
3. **Do not deploy BiRefNet** (or any BiRefNet-class model) until the owner approves it in writing.

## 9. File-by-file implementation plan (nothing built yet)
| File | Change | Resolves |
|---|---|---|
| `lib/bgremoval/types.ts` | contract extension (3.1): capabilities, approval, `ProviderError`, `warmUp`, `dispose` | A-1/3.4 |
| `lib/bgremoval/providers/index.ts` | registry that refuses unapproved providers in production builds; reads server-announced provider id | 3.4 |
| `lib/bgremoval/providers/mock.ts` (new, dev only) | deterministic mask for tests/CI | 6.2 |
| `lib/bgremoval/providers/api.ts` (new, later) | calls our API endpoint for the chosen vendor; cut-out adapter + size check | A-1 |
| `lib/bgremoval/providers/browser.ts` (new, later) | onnxruntime-web in a worker, WebGPU -> WASM with sanity check | A-3 |
| `lib/bgremoval/refine.ts` (new) | `normalizeAlpha`, `guidedUpsample`, `dilateErode`, `feather` (pure, unit-tested, run in worker) | B-7, 4.2 |
| `lib/bgremoval/resample.ts` | keep as the fallback; route through `refine` | 4.2 |
| `lib/bgremoval/composite.ts` | distance-scaled passes (or better foreground estimation) | B-5 |
| `lib/bgremoval/worker.ts` / `workerClient.ts` | ops `refine`, `preview-fg`; merge `transparency` into one decode; memory pre-check; feature-detect OffscreenCanvas with a main-thread fallback | C-1, B-8, 6.1 |
| `lib/bgremoval/renderer.ts` | preview of decontaminated colours; alpha-only mask canvas (or 1-channel texture) instead of RGBA; canvas-limit detection that *fails loudly* | B-6, B-8, B-2 |
| `lib/bgremoval/mask.ts` | `cancelStroke()`, undoable `normalize/feather/dilate/erode` ops | B-3, 4.2 |
| `lib/bgremoval/view.ts` (new) | pure view maths (`toImage`, `zoomAt`, `fit`) extracted from `MaskStage` for tests | 5.6 |
| `lib/bgremoval/useBackgroundRemoval.ts` | per-device `MAX_PIXELS`; typed errors; capability check before calling provider | B-2, B-8 |
| `components/editor/bgremoval/MaskStage.tsx` | pointer-id gesture machine, pinch/two-finger pan, wheel preference, scoped Space handler, DPR observer | B-3, B-4, C-3, C-5 |
| `components/editor/bgremoval/BackgroundRemovalDialog.tsx` | refine controls (feather, expand/contract), privacy line when `imageLeavesDevice`, mobile bottom sheet | 5.8, 7.1 |
| `services/api/src/media/cutout.ts` | real cancellation, queue released only when the model finished (or the process isolated), `AbortSignal` plumbing | B-1 |
| `services/api/src/routes/editor-media.ts` | `original` endpoint ungated from the removal flag (still authenticated, owner-scoped); format allow-list | B-9, 7.1 |
| `services/api/src/flags/*`, `env.ts` | `BACKGROUND_REMOVAL_PROVIDER` + approved-provider table replacing the boolean | 3.4 |
| `services/api/src/media/providers/*` (new, later) | vendor client, retry/timeout/circuit breaker, key from secrets, cost accounting | A-1 |
| `services/api/Dockerfile` / new inference image (only if self-hosting is approved) | separate glibc container, memory-sized | A-2 |
| e2e `83-*.mjs` + new suites | mock-provider run, multi-touch, memory cycles, corrupted/unsupported files | 6.2 |

## 10. Prioritised roadmap
**P0, no licence needed, do first:** B-1 server cancellation/queue; B-3 pointer/pinch state machine (+ `cancelStroke`); B-2 canvas-limit detection with a loud refusal and a per-device `MAX_PIXELS`; B-4 Space handler; B-9 ungate `original`; mock provider; contract extension; approval-gated registry.
**P1, quality:** alpha normalisation (B-7); distance-scaled decontamination (B-5); decontaminated preview (B-6); guided refinement; feather and expand/contract.
**P2, measurement:** memory/latency measurement at 4/12/25 MP; device matrix pass; acceptance-criteria dry run with the mock and the dev model.
**P3, owner decisions (gate the release):** choose provider route (commercial API / self-hosted / licence purchase); legal review of DIS5K; fill the licensing checklist; DPA; consent/privacy text; budget per call and credit pricing.
**P4, build the approved provider** (API proxy first), run section 6.2 on it, and only then set the approval record and the flag. Browser ONNX is revisited only if a clean, small model appears.

## 11. Not verified in this audit
Container behaviour of `onnxruntime-node` on Alpine vs Debian (daemon off); any non-Chromium browser; any phone; real memory numbers at 25 MP; the visual size of the B-5 halo; Firefox/Chromium differences for B-4; vendor terms (no vendor was read); whether the iOS 18 canvas limit really changed.

## Sources
- Canvas size limits on Safari/iOS: https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ , https://lionpuro-com.pages.dev/posts/canvas-is-finally-usable-on-safari (single-developer test of an iOS 18 increase; unconfirmed)
- OffscreenCanvas `convertToBlob` support: https://caniuse.com/mdn-api_offscreencanvas_converttoblob , https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/toBlob


---

## 12. Implementation status (P0 and P1 built 2026-11-19, development only, still NOT production-ready)

Nothing is committed or deployed. No model was downloaded or added; BiRefNet stays development-only; production offers no provider and the server refuses to run an unapproved one.

### P0 done
| Item | What was built | Proof |
|---|---|---|
| B-1 queue / cancellation | `media/cutout-queue.ts` (slots from a memory budget `CUTOUT_MEMORY_BUDGET_MB` / `CUTOUT_JOB_MB`, a slot is released only when the work has really stopped, waiting jobs are dropped when the caller leaves), `media/cutout-engine.ts` + `cutout-child.ts` (the model in a child process that is SIGKILLed on abort/timeout and retired when idle), `AbortSignal` from the request to the engine. **Root cause found on the way:** `noNul` (and `auth-guard`) replaced `c.req.raw` with a new `Request`, which has a fresh signal, so no route could ever see a client disconnect; the replacement now carries the original signal (`app.ts`, `security/auth-guard.ts`). | 8 queue/engine tests incl. real child processes; a test over REAL HTTP (abort travels socket to engine); e2e 83: after Cancel the model process is gone within seconds and the next picture starts a fresh one (before the fix the same process ran on, 3.7 GB) |
| B-3 multi-touch | `gestures.ts` state machine keyed by pointerId; `MaskEditor.cancelStroke()` (restores tiles, no history step, redo kept) | unit tests; e2e 84 with real touch events: a pinch never paints and leaves Undo/Reset disabled; one finger paints |
| B-2 canvas compatibility | `imageInfo.ts` (size from the file header BEFORE decoding), `limits.ts` (per-device limits, never a fixed 25 MP; override `?bgmaxmp=` / local storage), `canvasSupport.ts` (probe at the real size, read-back comparison, PNG sanity), used by the page, the renderer and the worker; failures are `CanvasUnsupportedError` with a plain sentence, the picture untouched | unit tests; e2e 84: over-limit picture refused before the provider is asked, no Try again |
| B-4 Space | `keys.ts`; Space is the stage's only when it has focus or the pointer is over it and never when the target is a control | e2e 84: Space presses a focused button and radio; Space+drag pans and paints nothing |
| B-9 original endpoint | no longer behind the removal flag; auth, deck access and ownership kept; PNG/JPEG/WebP by magic bytes (`media/image-format.ts`); animated pictures refused | API tests |
| mock provider | `providers/mock.ts` (+ failing/slow variants), deterministic, dev only, not in the production bundle | bundle grep: 0 hits |
| provider contract | `types.ts`: capabilities, approval, `ProviderError` codes, `warmUp`, `dispose`, `imageLeavesDevice`, max input, mask kind | typecheck, tests |
| approval gate | server `media/bg-providers.ts`: `BACKGROUND_REMOVAL_PROVIDER` only CHOOSES among providers; production needs an entry in `APPROVED_FOR_PRODUCTION` (empty; dev-only providers can never be approved: tested). Client `providers/index.ts` refuses providers without an approval record in a production build. The old `BACKGROUND_REMOVAL_APPROVED` boolean is gone. | API tests |

### P1 done
| Item | What was built | Measured |
|---|---|---|
| B-7 normalisation | `refine.ts normalizeAlpha`: continuous levels (<=6 -> 0, >=245 -> 255, a straight line between), not a threshold | e2e 84: >99.5% of the subject core exactly 255 and background exactly 0 (before: 71 pixels at 255) |
| B-5 halo reach | `foregroundColors` no longer stops after 8 rings (reaches up to 64, scales with the soft edge) | unit test: a 30 px soft edge is cleaned fully; the old behaviour is shown to leave a halo |
| B-6 preview = export | the preview draws the cleaned colours (worker `prepare`/`clean`), refreshed after whole-mask steps | e2e 84 |
| edge refinement | `refine.ts matteRefine` (see below) runs in the worker for masks that were enlarged | benchmark below |
| feather, expand/contract | `featherAlpha`, `growAlpha` (octagon), dialog section "Edge" (Shrink / Expand / Soften, 1-10 px), each ONE undoable step (`MaskEditor.replace`) | unit tests; e2e 84 |

### Where the evidence overrode this audit
Section 4.2 recommended a **guided filter**. It was built first and measured: on three synthetic scenes with a known true alpha it was WORSE than the plain enlargement overall (it moves edges but keeps the blurry values on both sides). It was replaced by a **local colour-line matte** (each soft pixel placed on the line between the clearly-subject and clearly-background colours nearby), with two protections found necessary by testing: windows of 1x, 2x and 4x the radius are tried (a mask edge wider than the window found nothing), and only pixels the mask is unsure about (2% to 98%) are changed (so a background poster of the subject's colour is not pulled in and a dark spot in the subject does not become a hole).
Mean absolute error against the true alpha (lower is better), plain enlargement -> new: edge 0.0090 -> 0.0000, texture 0.0187 -> 0.0015, hair 0.0334 -> 0.0005. On the REAL coffee photo with the real model mask: 179 ms for 1.8 MP, about 1% of pixels change, all at edges; the pot, pour stream and cup rim are visibly crisper and better placed.

### Honest limits of what was built
- **Not production-ready.** No approved model/provider (A-1), no production inference host (A-2), no usable browser model (A-3); those are decisions, not code.
- On the real photo the refined edge is crisp, slightly aliased on a light background, and the blurred fingertip area shows some speckle. A blanket 1 px soften removes the aliasing but blurs the stream and cup, so it is NOT applied automatically; the Soften control does it on request.
- The colour-line estimate is weak where subject and background colours are alike (it then leaves the mask as it was) and only improves edges the mask already marked as uncertain; thin hair the model lost entirely cannot be recovered.
- Tested in headless Chromium on macOS only (real touch events through Chromium's touch input). Safari, Firefox, Windows, Android and iOS devices are untested; the iOS canvas limit is handled by a probe and a conservative per-device limit but has not run on a device.
- Memory at the limit is still an estimate; an extra full-size bitmap now holds the cleaned colours for the preview (about +100 MB at 25 MP).
- Cancelling or timing out kills the model process, so the next picture pays the model load again (about 30 s on this machine); a finished process is retired after `CUTOUT_IDLE_MS` (5 minutes).
- Dev-only server inference remains BiRefNet in a child process; the Alpine/memory problem for production (section 3.3) is untouched. P2 (measurement) to P4 (approved provider) are not started.
