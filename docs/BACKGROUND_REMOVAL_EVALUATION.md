# Background removal: licensing and browser evaluation (2026-11-19)

**Status: NO model is approved for production.** Models below were downloaded for local technical evaluation only (owner's decision); nothing here ships to users. They live in `services/api/.local/eval-models/` (git-ignored).

## 1. Licensing findings (what was read, and what was NOT verified)
| Model | Weights licence | Training data | Verdict |
|---|---|---|---|
| BiRefNet (all exports) | MIT (repo LICENSE, model cards) | DIS5K and other academic sets. **DIS5K Terms of Use (read in full, page 1): "available for non-commercial use in research or educational purpose ... commercial use of this dataset is prohibited even after copying, editing, processing or any operations".** The `studioludens/birefnet-lite-512` card itself lists `datasets: ZhengPeng7/DIS5K`. Whether the terms reach trained weights is unsettled law. The full list of datasets was NOT verified from the BiRefNet README. | Not approved. Needs legal advice. |
| BEN2 (PramaLLC) | MIT (HF metadata) | "trained on the DIS5k and our 22K proprietary segmentation dataset" | Same DIS5K concern. |
| InSPyReNet | MIT (badge; LICENSE file not read) | DIS5K (news item); other sets not confirmed | Same concern. |
| MODNet | Apache-2.0 code and models (README) | "datasets mentioned in our paper" (paper NOT read) | Unresolved; portrait-only. |
| U-2-Net / rembg models | Apache-2.0 (model cards) | DUTS-TR: authors gave no licence; mirrors say academic/research use | Unresolved. |
| IS-Net | Apache-2.0 / MIT (cards) | DIS5K | Same concern as BiRefNet. |
| BRIA RMBG-1.4 / 2.0 / 3.0 | CC BY-NC 4.0, commercial use needs a paid agreement with BRIA | RMBG-3.0 says "trained exclusively on licensed data" | Commercial licence needed. |
| @imgly/background-removal | AGPL-3.0 | n/a | Not usable without a commercial licence. |
| withoutBG Open | Apache-2.0 (trained weights) AND the Meta DINOv3 licence (backbone: needs "Built with DINOv3", licence copy, prohibited-use and export terms) | Best documented trail: public Unsplash/Pexels photos with alpha mattes they made, purchased sets "with explicit derivative rights", synthetic renders; about 60K pairs. **But its router also sends "hard objects" to BiRefNet (MIT, DIS5K concern again)**, a "Apache-2.0 training data" claim was NOT found, about 1.5 GB of weights, CPU ONNX, no browser support found | Cleanest trail found, not clean, not browser-sized. |
| Segment Anything (SAM) | Apache-2.0 | SA-1B is under the "SA-1B Dataset Research License" (research purposes) | Same class of concern. |
| Paid APIs / AI image edit (Gemini etc.) | their terms | their responsibility, but terms must still be read | Fallback; read commercial-use, data-handling and output-rights terms before choosing. |

Conclusion: **no open-weights segmentation model found has a clean, documented commercial training-data trail.** Options: legal advice on the BiRefNet-class risk; a commercial licence (BRIA, IMG.LY); a paid provider; or withoutBG after a closer look.

## 2. Browser evaluation of the two approved 512 exports (pinned revisions)
- `studioludens/birefnet-lite-512` @ `4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7` (BG0's pin; HEAD was `962e6796…` on 2026-11-19). Card: `license: mit`. No LICENSE file at that revision. fp32 191.9 MB (sha256 `1cb0fb36…45ac2`), fp16 98.5 MB (sha256 `eff9216b…ffc516`).
- `naddy24/birefnet-512-webgpu` @ `ca02a86c094927479e2be583abe87f8ea73fcfda`. Card: `license: mit`, base `onnx-community/BiRefNet_512x512-ONNX`. fp16 473.4 MB (sha256 `6ea208a5…c3b3d8`).
- Setup: Playwright Chromium (headless shell 1243), macOS arm64, 12 cores, Apple GPU (WebGPU adapter present). ONNX Runtime Web **1.31.1** (stable) with my own preprocessing (512 resize, ImageNet normalisation, sigmoid on the logits), and also Transformers.js 4.3.2. Real phones, Safari, Firefox and Windows GPUs were NOT tested.

| Run | Time per picture | Browser memory (peak, all processes) | Mask quality |
|---|---|---|---|
| lite-512 fp32, WASM (CPU) | 1.5 to 2.5 s (model load about 2 s) | 2.4 to 3.4 GB | **Poor:** sneaker 9% foreground and an empty cut-out, woman a ghosted torso, ceramics empty, coffee photo no foreground at all. The 1024 model (server) is clean on all four. |
| lite-512 fp32 / fp16, WebGPU | 0.6 to 1.6 s after the first | 3.0 to 3.5 GB | **Unusable:** every logit negative, no foreground on any picture |
| full-512 fp16, WebGPU / WASM | 2.0 to 2.4 s / 5.5 to 6.9 s | 2.7 to 3.4 GB | WebGPU: no foreground on any picture (WASM not quality-checked) |
| 1024 lite (onnx-community), WASM | n/a | out of memory (`std::bad_alloc`), also stated on the 512 model card | n/a |
| lite-512 fp32 in native Node onnxruntime | n/a | n/a | **Identical foreground shares to the browser CPU run** (woman 43%, sneaker 9%, ceramics 32%, coffee 0%): the weakness is in the export, not the browser runtime |

So: with these exports and the card's own recipe, **browser-side quality was not good enough in my tests**, and the GPU path produced nothing. I cannot confirm the card's claim "edge quality is indistinguishable from the 1024 reference". Possible reasons not ruled out: a fixed 512 input loses detail on whole-photo subjects (the card says it was built for small crops), or an export defect. Browser memory of 2.4 to 3.4 GB is also too high for phones.

## 3. What is solid and can continue regardless of the model
The editor dialog (erase and restore brushes, undo/redo, background replacement, export at original size) does not depend on which model makes the first mask. Plan: a small `SegmentationEngine` interface (load with progress, segment an image to an alpha mask); engines: browser ONNX Runtime Web in a Web Worker (once a model is approved and verified), the server endpoint that exists today (BiRefNet 1024, dev only until the production decision), and later a paid provider if chosen. See docs/REMOVE_BACKGROUND.md for the server work and its production blockers.
