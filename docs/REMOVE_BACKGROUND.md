# Remove background (built 2026-11-19)

**What it does.** The subject of one of the person's pictures is cut out and everything behind it becomes transparent: a new transparent PNG, cropped to the subject, kept as one of THEIR pictures (it also appears in "My uploads"); the original stays. Free (no credits), nothing leaves our server.

**Where.** (1) The "Remove background" button in the floating toolbar of a selected picture. (2) The assistant: "remove the background from this image" cuts out the main picture(s) of the target slide (never taken for "remove the picture"). A picture of a Morph template is changed on every slide it is on (the Morph moves that one picture); any other picture only on its own slide. One undo step.

**How.** `services/api/src/media/cutout.ts` (model + image work), `media/cutout-picture.ts` (which pictures may be cut: the owner's own stored pictures and the pictures that ship with templates, nothing else), `POST /presentations/:id/images/cutout` (60 per hour per person, one at a time, at most 6 waiting), assistant request `slideOps.cutouts` executed in `routes/presentations.ts`, editor `swapPicture` in `commands.ts`.

**Model and licence.** BiRefNet lite, ONNX conversion `onnx-community/BiRefNet_lite-ONNX`, revision pinned in `CUTOUT_MODEL` (`de15b22b…`). Licence MIT (upstream repo LICENSE and the model card: `license: mit`). Run with `@huggingface/transformers` (Apache-2.0) on `onnxruntime-node` (MIT). Chosen over `@imgly/background-removal` because that one is AGPL-3.0; BRIA RMBG models are non-commercial. Re-check the licences if the model or revision is changed.

**Cost and speed.** About 7 to 11 seconds per picture on a laptop CPU (the first one also loads the 224 MB model, about 30 s). **Memory (measured 2026-11-19, macOS arm64, onnxruntime-node 1.30): about 0.8 to 1 GB resident once loaded and a PEAK of 4.4 GB while a picture is worked on (2 to 3 GB in other runs; 6.6 GB with the memory arena off, 4.9 GB with the fp16 file).** The model has a FIXED 1024 x 1024 input (a 768 or 512 input is refused by the model), so the peak cannot be lowered by shrinking the picture. This does not fit the production server (1 GB + swap; API container limit 420 MB, worker 900 MB).

**Configuration.** `CUTOUT_MODEL_DIR` (default `services/api/.local/models`, git-ignored) and `CUTOUT_ALLOW_DOWNLOAD` (default on; set `0` in production so nothing is fetched at run time).

## Production: NOT READY (two separate problems, 2026-11-19)
1. **The Alpine (musl) API image cannot load `onnxruntime-node`** (its binaries need the standard Linux C library): "Error loading shared library ld-linux-aarch64.so.1" in `node:22.23.5-alpine3.24`; `gcompat` + `libstdc++` is not enough ("__sprintf_chk: symbol not found"). Needs a Debian-slim image (or a separate Debian container).
2. **The model does not fit the server.** BiRefNet lite peaks at several GB (see above). Fixing the image alone would only move the failure from "does not load" to "killed for lack of memory", and an out-of-memory kill of the API or worker container would take generation down with it.

Ways forward (owner decision): (a) keep BiRefNet and run it where there is memory: a separate container on a bigger instance, or an on-demand task (about 4 to 8 GB), with the API calling it; (b) a lighter permissively licensed model that fits (U-2-Net, 320 x 320 input, Apache-2.0 on its model card, 176 MB: expected well under 1 GB, lower edge quality than BiRefNet; NOT yet tested here because downloading it was not approved); (c) an AI image-edit model paid in credits (no exact pixels, no real transparency, see the discussion in the chat).
Whichever is chosen: bake the model into the image, `CUTOUT_ALLOW_DOWNLOAD=0`, make `docker-check.mjs` load the runtime AND run one tiny inference so a broken image fails the BUILD, and keep one cut-out at a time (already so).

Tests: `routes/cutout.test.ts` (stand-in model), assistant tests, editor `template-pictures.test.ts`; real model and real assistant: e2e suite `82-remove-background`.

## Editor dialog (built 2026-11-19, development only, NOT production-ready)

**Status:** a complete, model-independent "Remove background" dialog. It works in development with our server model (BiRefNet lite) as the only source. It is not shipped to customers and must not be until a commercially usable model/provider is approved (see BACKGROUND_REMOVAL_EVALUATION.md).

**Layers** (`apps/editor/src/lib/bgremoval/`, no layer knows the model):
- `types.ts` - `SegmentationProvider.segment(input) -> ForegroundMask` (a 0-255 grey mask of ANY size). A server model, a commercial API or a browser model only has to return that.
- `providers/server.ts` (dev-only) and `providers/index.ts` (`backgroundRemovalProvider()` returns a provider only when `import.meta.env.DEV`). Swapping the provider changes one file, not the UI.
- `worker.ts` / `workerClient.ts` - off the main thread: resample the mask to the ORIGINAL pixel size, read a picture's own alpha, and export.
- `mask.ts` - `MaskEditor`: immutable base mask (the provider's), strokes as editable operations (soft brush, erase = min, restore = max), tile patches for undo/redo (no re-inference), bounded history, exact `isEdited`, Reset to the AI mask (itself undoable).
- `renderer.ts` - canvas preview: mask updated per dirty rectangle, checkerboard, before/after, zoom/pan.
- `composite.ts` - export maths: edge-colour decontamination (no white/black fringes), compose over transparent / colour / picture.
- `useBackgroundRemoval.ts` - the hook: load original, validate (<= 25 MP, <= 10000 px side), mask (own alpha if already cut out, else provider), cancel/retry/cleanup.
- UI: `components/editor/bgremoval/{BackgroundRemovalDialog,MaskStage}.tsx`.

**Export:** the PNG is built in the worker at the original resolution, as straight alpha (`OffscreenCanvas.convertToBlob`). "Download" never shrinks. "Apply to slide" uploads it and only scales down if it would exceed the 7.5 MB upload limit. The original picture stays in the library.

**Dev-only gating:** server flag `background_removal` (default on only when `NODE_ENV !== 'production'`; in production it stays off unless `BACKGROUND_REMOVAL_APPROVED=true` as well), endpoints `cutout`, `cutout-mask`, `original` refuse when off; the client dialog is lazily imported only in DEV (verified: a production `vite build` has no dialog, editor, worker or provider code).

**Tests:** `lib/bgremoval/*.test.ts` (23), `services/api/src/routes/cutout.test.ts` (7), e2e `83-background-removal-dialog` (11 checks, real browser + real model).

**Known limitations:** one-pointer painting only (no pinch zoom); mask edge detail is bilinear upscaling of the model's mask; a picture that is already transparent cannot get back areas whose colour was lost; the model's matte rarely reaches exactly 255; Apply may downscale to fit the upload limit; WebGPU/browser providers untested; the assistant's cut-out path is still server-side and flagged.


## Update 2026-11-19: P0 and P1 production-readiness work
The server model now runs in a killable child process behind a memory-budgeted queue (a cancel or timeout really stops it), provider approval is a named allow-list in code (`media/bg-providers.ts`, empty), the editor has a mock provider, typed provider errors, per-device size limits with canvas checks, pointer-id gestures (pinch never paints), scoped Space handling, a mask refinement step and Edge controls. Details, measurements and limits: `docs/BACKGROUND_REMOVAL_PRODUCTION_AUDIT.md` section 12. Env: `BACKGROUND_REMOVAL_APPROVED` is removed (replaced by `BACKGROUND_REMOVAL_PROVIDER`, which cannot approve anything); new optional `CUTOUT_MEMORY_BUDGET_MB`, `CUTOUT_JOB_MB`, `CUTOUT_MAX_WAITING`, `CUTOUT_TIMEOUT_MS`, `CUTOUT_IDLE_MS`.
