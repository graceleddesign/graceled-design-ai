# Round 1 V2 — LoRA Feasibility Audit

**Status:** Report only. No training started. No paid calls made. No production behavior changed.
**Date:** 2026-05-01
**Scope:** Feasibility assessment for the next decisive generative-design experiment: LoRA fine-tuning vs. alternative base model, with a hard Phase 2 cost ceiling.

---

## Context

A Phase 1 reference-conditioned spike using `fal-ai/nano-banana-pro/edit` with 4 owned references per mode produced 1/4 passing outputs against the quality bar (typography_led, marginally). The three failures (graphic_symbol, minimal_editorial, modern_abstract) all collapsed to stock priors despite explicit anti-stock prompting and 4 owned conditioning images per call. Conclusion: **prompt-time reference conditioning alone does not overcome stock priors**. The next question is whether moving the prior through LoRA fine-tuning, or switching to a base model with stronger design priors, changes this.

---

## Part A — Reference Library Inventory

### Counts

| Metric | Count |
|---|---|
| Total normalized references (index.json) | 161 |
| Total raw files | 161 (310 files = each ref has a `ref_N.jpg` and `ref_N 2.jpg` duplicate) |
| Total curated entries (curation.json) | 62 |
| Curated pro tier | 55 |
| Curated experimental tier | 7 |
| Uncurated (no curation.json entry) | 99 |

### Format and dimensions

All 161 references are **flattened raster images** (JPG or PNG). No layered source files (PSD, AI, SVG, Figma exports) are present in the repo in any of `reference_library/raw/`, `reference_library/normalized/`, or `public/reference-thumbs/`.

- Raw: 310 JPGs + 12 PNGs at original resolution (typically 3840×2160 or 4951×3329 for large assets; many at 1600×900 after normalization).
- Normalized: 1600×900 PNGs (16:9), a few at slightly varying heights (905px). These are the working training candidates.
- Thumbs: 161 PNGs in `public/reference-thumbs/` — web display quality, not training quality. Use normalized, not thumbs, for training.
- Aspect ratio: 154/161 are 16:9. 7 are non-standard (720×280, 1000×562, 1280×720). The non-standard ones should be excluded from training data.

### Text contamination analysis

The library is a collection of **designed identity systems with baked-in typography**. Almost all references contain rendered title/subtitle text. This is the core training risk.

| Contamination risk | Clusters | Curated pro count |
|---|---|---|
| **HIGH** — title IS the design, type dominates the image | bold_type, retro_print | 14 (bold_type) + 0 (retro_print all experimental) = **14** |
| **MEDIUM** — type present but composition-integrated; may be maskable | editorial_photo, illustration, cinematic | 8 + 8 + 10 = **26** |
| **LOW** — type minor or absent; mostly texture/field/abstract | minimal, modern_abstract, architectural | 8 + 7 + 1 = **16** |

**High-risk conclusion:** 40/55 pro-curated references (73%) carry prominent baked-in typography that a naively trained LoRA would learn to reproduce. Training on these as-is risks producing a model that generates pseudo-text, pseudo-letterforms, or baked-in caption artifacts — which is an auto-disqualifier under the existing hard rules.

**Low-risk candidates (16 pro):** ref_0001, ref_0004, ref_0031, ref_0048, ref_0055, ref_0057, ref_0062, ref_0071, ref_0072, ref_0073, ref_0115, ref_0118, ref_0122, ref_0139, ref_0143, ref_0150. These span minimal, modern_abstract, and architectural clusters. They are the only references currently usable as training data without text-removal preprocessing.

### Whether current thumbs are suitable for training as-is

**No.** Multiple problems:
1. Text contamination throughout (see above).
2. Thumb resolution (161 PNGs in `public/reference-thumbs/`) is web-display quality — not suitable for training. Use normalized.
3. 16:9 aspect ratio differs from Flux training best practices (which prefers square or near-square crops with mixed aspect ratio training). Fine-tuning purely on 16:9 crops will narrow the model's output ratio flexibility.
4. Many references show genre-standard "inset card + bevel" failure patterns (explicitly flagged in the taxonomy doc) — training without curation would learn failure patterns alongside quality patterns.

### Layered source files — critical gap

**No layered source files are present in the repo.** The `reference_library/raw/` directory contains only flattened JPG/PNG.

**This must be flagged and actioned before proceeding to training.** The user must answer:

1. Do original layered design files (PSD, AI, Figma, etc.) exist for any of the 161 references?
2. If so, where are they stored? (Dropbox, Google Drive, design team machine, archive drive?)
3. Who created these designs — in-house design team, commissioned designers, or third parties?
4. For commissioned works: are there license terms that govern ML training use?
5. For any references sourced from stock or third-party design archives: are ML training rights held?

If layered files exist and are accessible, manually extracted text-free background plates from those files are the **highest-quality possible training data** for this use case — far better than any inpainting/masking approach. Without them, the training dataset quality ceiling is significantly lower.

### Text contamination risk level

**High.** The library was built as a reference quality bar, not a training dataset. Using it for training without text removal or source-file extraction would most likely teach the model to produce baked-in typography — the opposite of the hard "text-free background plate" requirement.

---

## Part B — Dataset Readiness Matrix

| Tier | Description | Viable size | Text contamination risk | Design diversity | Recommendation |
|---|---|---|---|---|---|
| **1. Full flattened references as-is** | All 55 pro-curated normalized PNGs | 55 images | **CRITICAL** — 73% carry prominent type | Good across 7 clusters | **Do not use.** LoRA would learn to generate pseudo-text. Disqualifies outputs. |
| **2. Low-risk subset (minimal + abstract)** | 16 pro refs from minimal, modern_abstract, architectural | 16 images | **LOW** — mostly field/texture/non-type | Narrow — only 3 clusters | **Below minimum viable for LoRA.** 16 images is too small; strong risk of overfitting and mode collapse. Not viable alone. |
| **3. Masked/inpainted text-removed versions** | Automated or manual text masking on all 55 pro, then inpainting | ~55 images (post-process) | **MEDIUM** — depends heavily on mask quality | Good across 7 clusters | **Risky and labor-intensive.** Automated text detection on designed graphics has high false-positive and false-negative rates. Inpainting artifacts may be worse than the original type. Estimated effort: 4–8 hours for manual review + masking. Not recommended as primary path; acceptable supplement for medium-risk cluster refs. |
| **4. Manually extracted layered backgrounds** | Background-only exports from PSD/Figma/AI source files, if accessible | Unknown — requires answering source-file questions | **VERY LOW** — clean plates by construction | Excellent — full design intent preserved | **Best possible path.** Produces exactly the training signal we want: designed backgrounds that were intentionally composed for typography without baked-in type. **Requires answering the 5 source-file questions in Part A before this tier is accessible.** |
| **5a. Mode subset: modern_abstract** | 7 pro refs (ref_0004, 0031, 0055, 0057, 0072, 0073, 0122) | 7 images | LOW | Narrow — 1 cluster | **Not viable alone** — 7 images will overfit severely. |
| **5b. Mode subset: minimal_editorial** | 8 pro refs (ref_0001, 0048, 0062, 0115, 0118, 0139, 0143, 0150) | 8 images | LOW–MEDIUM (some have minimal type) | Narrow | **Not viable alone** — 8 images is below any safe LoRA minimum. |
| **5c. Mode subset: cinematic** | 10 pro refs (ref_0017, 0019, 0044, 0066, 0083, 0101, 0107, 0114, 0157, 0161) | 10 images | MEDIUM — some have legible overlay type | Single cluster | **Closest to viable** if type is masked, but cinematic is the mode that already works reasonably well. Not the bottleneck to fix. |

### Minimum viable training set (honest assessment)

For a style LoRA to do anything meaningful on Flux, the documented minimum from FAL's own guidance (`flux-lora-fast-training`: "try to use at least 4 images in general the more the better") is misleading for style training — the "4 image" figure is for subject/character LoRAs with segmentation. For a style LoRA with `is_style=true`, practical minimums observed in the community are 15–25 clean, diverse images. For genuine quality-bar shift (not just trigger-word style bleed), 30–60 well-captioned images is the practical floor.

**Current clean, low-risk, training-ready count: 16 images.** This is below the floor for a reliable style LoRA on Flux.

**Verdict: The dataset is NOT strong enough for a meaningful LoRA experiment as-is.** Proceeding would waste training spend on a dataset likely to produce either overfitting or pseudo-text contamination.

---

## Part C — Provider / Training Capability Audit

All endpoint names verified from `@fal-ai/client` v1.9.5 types (`node_modules/@fal-ai/client/src/types/endpoints.d.ts`). Costs marked **[needs external verification]** where not derivable from local types.

### Training endpoints

| Endpoint | Type | Accepts | Key inputs | Key notes |
|---|---|---|---|---|
| `fal-ai/flux-lora-fast-training` | Style/subject LoRA training on Flux Dev | zip of images + optional captions | `images_data_url`, `trigger_word`, `steps`, `is_style` | `is_style=true` disables segmentation/captioning, uses trigger word instead — correct mode for style training. Min 4 images (vendor claim). Outputs `diffusers_lora_file`. |
| `fal-ai/flux-krea-trainer` | Style/subject LoRA training on Flux Krea | zip of images + optional captions | Same interface as fast-training | Identical input schema to `flux-lora-fast-training`. Base model is Flux Krea, which has reportedly stronger adherence to design/photo aesthetics than vanilla Flux Dev. |
| `fal-ai/flux-kontext-trainer` | Edit-pair LoRA training | zip of before/after image pairs + captions | `image_data_url` (pairs named `_start`/`_end`), `steps`, `learning_rate` | **Different use case** — trains on edit transformations, not style. Not applicable for style LoRA. |
| `fal-ai/flux-lora-portrait-trainer` | Portrait-optimized LoRA | zip + captions | `trigger_phrase`, `steps=2500`, `multiresolution_training`, `subject_crop` | Portrait-specific; segmentation and face-mask oriented. **Not appropriate for design-style training.** |

### Inference endpoints (LoRA-capable)

| Endpoint | Base model | LoRA support | Image conditioning | Reference multi-image | Notes |
|---|---|---|---|---|---|
| `fal-ai/flux-lora` | Flux Dev | ✅ (`loras: LoraWeight[]`) | ❌ text-to-image only | ❌ | Standard Flux Dev + LoRA inference. Text-to-image only. |
| `fal-ai/flux-krea-lora` | Flux Krea | ✅ (`loras`) | Partially (image-to-image variant exists) | ❌ | Krea base with LoRA stacking. Verified: `fal-ai/flux-krea-lora`, `fal-ai/flux-krea-lora/image-to-image`, `fal-ai/flux-krea-lora/inpainting`, `fal-ai/flux-krea-lora/stream`. |
| `fal-ai/flux-kontext-lora` | Flux Kontext | ✅ (`loras`) | ✅ single `image_url` | ❌ multi | Image-editing model with LoRA. Useful if training edit pairs. Not our current training format. |
| `fal-ai/flux-kontext-lora/text-to-image` | Flux Kontext | ✅ | ❌ | ❌ | Text-to-image variant of Kontext + LoRA. |
| `fal-ai/flux-2/lora` | Flux 2 | ✅ | TBD | ❌ | Newer Flux variant with LoRA. |
| `fal-ai/nano-banana-pro/edit` | Gemini 2.5 Flash Image (inferred) | ❌ no LoRA | ✅ `image_urls: Array<string>` | ✅ multi | Already integrated. Multi-image conditioning but no LoRA support path. |
| `fal-ai/nano-banana/edit` | Nano Banana (base) | ❌ | ✅ | ✅ | Fallback variant, same conditioning pattern. |
| `fal-ai/flux/dev` | Flux Dev | Via `flux-lora` endpoint | ✅ `image_url` | ❌ | Already integrated as `fal-image.ts`. |

### Non-LoRA inference endpoints of interest

| Endpoint | Notes |
|---|---|
| `fal-ai/imagen4/preview` | Google Imagen 4. Text-to-image only (no LoRA, no image conditioning confirmed in types). Aspect ratio support: 1:1, 16:9, 9:16, 4:3, 3:4. Resolution: 1K/2K. Strong prompt-following documented. No training path accessible. |
| `fal-ai/imagen4/preview/fast` | Faster/cheaper Imagen 4 variant. Same input schema. |
| `fal-ai/imagen4/preview/ultra` | Higher quality variant. |
| `fal-ai/flux/krea` | Flux Krea text-to-image (no LoRA). Referenced at endpoint `"fal-ai/flux/krea"`. |

### Costs

**[All costs require external verification at fal.ai pricing page — not derivable from local typings.]**

Community-reported estimates (treat as directional, verify before committing budget):

- `fal-ai/flux-lora-fast-training`: ~$1–$3 per training run depending on step count (500–1000 steps typical for style).
- `fal-ai/flux-krea-trainer`: Similar to fast-training — ~$1–$3.
- `fal-ai/flux-lora` inference: ~$0.003–$0.006/image at standard resolution.
- `fal-ai/flux-krea-lora` inference: ~$0.005–$0.01/image (Krea is typically more expensive per inference than schnell).
- `fal-ai/imagen4/preview` inference: ~$0.04–$0.08/image (Google models via FAL tend to be higher per-call). **[verify]**
- `fal-ai/nano-banana-pro/edit` inference: ~$0.05–$0.10/image (confirmed in Phase 1 spike context).

---

## Part D — Alternative Base Model Audit and Skip/Run Decision

### Candidates with potentially stronger design priors

| Model | Access path | Design prior strength (assessed) | Image conditioning | LoRA path | Notes |
|---|---|---|---|---|---|
| **Flux Krea** (`fal-ai/flux/krea`) | Current stack, verified endpoint | **Moderately stronger than Flux Dev** — Krea is a collaborative fine-tune of Flux 1 known for stronger aesthetics, cleaner outputs, better prompt-following for composition. Not a magic fix, but a documented improvement over vanilla Flux Dev. | Yes (image-to-image via `fal-ai/flux-krea-lora/image-to-image`) | Yes (`fal-ai/flux-krea-trainer`) | No new integration needed. |
| **Imagen 4** (`fal-ai/imagen4/preview`) | Current stack, verified endpoint | **Strong prompt-following, cleaner outputs** — Google's Imagen 4 is documented to have excellent text-to-image quality and better adherence to compositional prompts than Flux Dev. No LoRA path available. No multi-image conditioning confirmed in types. | ❌ types show no `image_url` input | ❌ no training endpoint | Useful for a direct prompt-quality benchmark, not for conditioned generation. |
| **Nano Banana Pro** (already tested) | Current stack, integrated | Confirmed: overcomes stock priors only for typography_led, fails for 3/4 modes. | ✅ multi-image | ❌ no LoRA | Phase 1 result is the data point. |
| **Flux Kontext** (`fal-ai/flux-kontext-lora`) | Current stack, verified | Edit-model, strong at constrained image editing. Prior is edit-focused, not design-style-focused. | ✅ single image | ✅ edit-pair LoRA | Wrong fit for style training. Not a candidate. |

### Skip/run decision: alt-model benchmark before LoRA

**Decision: Run a minimal Imagen 4 benchmark (4 calls, matching Phase 1 exactly) before committing to LoRA training spend.**

**Criterion:** Imagen 4 is documented to have materially stronger prompt-following and compositional adherence than Flux Dev. It is accessible at the same fal.ai endpoint with no new integration work. If Imagen 4 passes 2/4 modes against the Phase 1 quality bar using the same prompts (no reference conditioning, text-to-image only), it establishes a higher quality floor *before* any LoRA investment, and the LoRA experiment can be designed on top of Imagen 4 rather than Flux Dev.

**Estimated cost of the benchmark: 4 × ~$0.06 = ~$0.24. This is cheap enough not to require a separate approval cycle.**

**The benchmark should reuse the exact Phase 1 prompt set** (same 4 modes, same brief, same hard rules) and score against the same rubric. A 2/4 pass or better changes the LoRA training target from Flux Dev to Imagen 4 (if a training path becomes available) or establishes Imagen 4 as the base inference model for the nano-banana-pro replacement.

**Rationale for not defaulting to LoRA immediately:** The Phase 1 failure pattern — stock priors overwhelming prompt intent — is a base-model-prior problem, not a prompt-engineering problem. Spending $2–$5 on LoRA training on top of a weak base prior produces a weak style LoRA. Running a $0.24 benchmark first is a much cheaper gate.

---

## Part E — Phase 2 Paid Experiment Plan

### Training dataset recommendation

**Tier: Do not train yet. Complete dataset preparation first.**

If the Imagen 4 benchmark (see below) produces ≥2/4 passes, Imagen 4 becomes the inference target and LoRA training on Flux Dev becomes lower priority. If the benchmark confirms the problem persists at the base level, proceed to dataset preparation, not training.

If proceeding to training after benchmark:
- **Collect and answer all 5 source-file questions from Part A** before spending on training.
- If layered source files exist: extract clean text-free background plates from the strongest 30–40 references (targeting all 7 active mode clusters).
- If no source files: prepare text-removed versions of the 16 low-risk references + 15–20 medium-risk references via careful manual masking (estimated 4–6 hours). Do not automate masking without human review per image.
- **Target training set size: 30–50 clean images** with caption files per image.

### Caption/trigger-word strategy

For style LoRA (`is_style=true`):
- Trigger word: `GLDESIGN` (short, distinctive, unlikely to conflict with base model vocabulary).
- Do not use captions per-image when using trigger-word mode — the model ignores them when `is_style=true`.
- Alternatively, use caption mode with per-image descriptions of composition and mood (not content) and embed `GLDESIGN` in every caption.

For caption-mode training (if more control is needed):
- Caption pattern: `GLDESIGN [mode], [palette description], [composition structure], [no text], [restraint level]`.
- Example: `GLDESIGN minimal_editorial, near-monochrome warm grey, wide negative space left of center, no text, high restraint`.

### One general LoRA or mode-specific LoRAs?

**Start with one general GraceLed style LoRA.** Reasons: dataset is too small for mode-specific splits (7–8 images per mode is below any safe minimum). A single style LoRA trained on the full clean set establishes whether style transfer is happening at all. Mode-specific LoRAs are a Phase 3 experiment, not Phase 2.

### Training and inference endpoints

- **Training (if proceeding):** `fal-ai/flux-krea-trainer` preferred over `fal-ai/flux-lora-fast-training` — Flux Krea base has stronger design aesthetics, and the trainer interface is identical. Steps: 500–800 for a first-pass style LoRA.
- **Inference:** `fal-ai/flux-krea-lora` (text-to-image). If image conditioning is needed alongside LoRA, use `fal-ai/flux-krea-lora/image-to-image`.

### Four evaluation prompts (Phase 2 — matching Phase 1 exactly)

Reuse the exact prompts from `scripts/experiment-reference-conditioned-generation.ts`, with the trigger word prepended:

1. **typography_led:** `GLDESIGN` + typography-first plate prompt (quiet structured field, strong type zone, etc.).
2. **graphic_symbol:** `GLDESIGN` + single-mark plate prompt.
3. **minimal_editorial:** `GLDESIGN` + restraint/negative-space prompt.
4. **modern_abstract:** `GLDESIGN` + non-photographic atmosphere prompt.

All hard rules remain: zero text, no rendered title, text-free background plate.

### Pass/fail thresholds

Same as Phase 1 rubric. A pass requires all must-haves AND the output is non-generic:
1. Zero readable text or pseudo-text.
2. Compositionally distinct from background + title overlay.
3. Non-generic (not stock church, not Canva, not Shutterstock, not worship-gradient).
4. Suitable as a typography-lockup base.

**Success definition:** LoRA passes 2/4 modes across different mode types, where at least one is a mode that failed in Phase 1 (graphic_symbol, minimal_editorial, or modern_abstract). A result of 2× typography_led style wins does not count as success.

**Force a strategy change if:** LoRA passes only typography_led (again) OR produces pseudo-text artifacts in any output. Both signal the training approach needs to change before more spend.

### HARD COST CEILING — Phase 2

**Sub-experiment 2a: Imagen 4 benchmark (recommended immediate next step)**
- 4 inference calls × $0.08 each (conservative) = $0.32
- Buffer: $0.68
- **Sub-experiment 2a ceiling: $1.00**

**Sub-experiment 2b: LoRA training + evaluation (only if 2a confirms Flux-class models are the bottleneck AND dataset prep is complete)**
- Dataset prep: no direct cost (labor only)
- Training run: 1× `fal-ai/flux-krea-trainer`, 800 steps ≈ $3.00 (estimated; verify)
- Evaluation: 4 inference calls × $0.01 = $0.04
- One retry training run (if first fails): $3.00
- Evaluation retry: $0.04
- Upload costs (training zip to fal.storage): negligible (~$0)
- Buffer: $1.00
- **Sub-experiment 2b ceiling: $8.00**

**Total Phase 2 ceiling (2a + 2b): $9.00**

> **Phase 2 will cost no more than $9. Ensure fal.ai balance is at least $14 before proceeding ($9 ceiling + $5 buffer).**

Sub-experiment 2a ($1 ceiling) should be run first and does not require dataset preparation — it uses text-to-image only. Sub-experiment 2b requires dataset preparation completion and should not be started until 2a result is known.

---

## Part F — Risk Report

### Pseudo-text contamination from text-bearing training references

**Risk level: HIGH if training on unprocessed references.** The bold_type cluster (14 pro refs) is the highest concern — these are designs where the title letterforms ARE the artwork. A LoRA trained on them will have strong pressure to reproduce letter-like shapes. Even `is_style=true` mode, which uses a trigger word rather than per-image captions, cannot fully isolate style transfer from content transfer at this dataset size. **Mitigation: do not include bold_type or retro_print refs in training data without clean text-free source plates.**

### Reference overfitting / near-copying / IP risk

**Risk level: MEDIUM.** At 30–50 images (the target clean set), a Flux style LoRA at 800 steps should not memorize individual compositions, but test images should be spot-checked against the training set using perceptual hash or visual inspection. More serious: if any references were created by third-party design studios for the church client, the IP ownership of those designs for ML training purposes is unclear. **Mitigation: answer the ownership/licensing questions in Part A before training.**

### Loss of motif specificity

**Risk level: LOW for style LoRA, higher for narrow cluster LoRA.** A general style LoRA trained on all 7 clusters won't teach the model specific motifs (vine, doorway, etc.) — it will teach design grammar (palette restraint, composition intent, type-readiness). Motif specificity is handled at prompt time, not training time. This is acceptable for Phase 2.

### Stock-prior persistence after LoRA

**Risk level: MEDIUM.** Flux Dev's stock-imagery and stock-logo priors are strong. A small style LoRA (500–800 steps, 30–50 images) will shift the aesthetic but may not fully overcome the priors that caused Phase 1 failures (water-droplet stock photo, geometric Dribbble logo). This is the key unknown that Phase 2 training + evaluation will answer. If the LoRA shifts the modern_abstract output off worship-gradient and onto designed field, that's a meaningful signal even if graphic_symbol still fails.

### Mode collapse

**Risk level: MEDIUM** if training data is not mode-diverse. If training set is heavily minimal/abstract (which is where the clean images live), the LoRA may shift all outputs toward that aesthetic regardless of mode prompt. **Mitigation: ensure training set covers all 7 active clusters, even if some require text removal to include.**

### Narrow house-style risk

**Risk level: LOW–MEDIUM.** The reference library deliberately has aesthetic coherence — that's its purpose. A style LoRA will amplify that coherence. Risk: every mode starts to look like the same palette and composition grammar regardless of brief. At Phase 2 scale this is acceptable; at production scale it would need mode-specific LoRAs or stronger mode-aware prompting. Flag for Phase 3 evaluation.

### Licensing / ownership of reference designs

**Risk level: UNKNOWN — requires user input.** If any references were commissioned from external design studios, ML training rights may not be included in the work-for-hire agreement. If any references are derived from stock image purchases, stock license terms typically prohibit ML training use. **This must be clarified before any training run.** Running training on unlicensed materials is a legal risk regardless of the quality outcome.

### Cost per acceptable output at projected pass rate

At the Phase 1 result (1/4 pass), the current approach costs roughly $0.40/call × 4 = $1.60 to get one acceptable output. If LoRA improves pass rate to 2/4, cost per acceptable output drops to ~$0.80. If pass rate stays at 1/4 after LoRA, the $8 training spend yielded no improvement and the strategy needs to change. **This cost-per-output math will be the Phase 2 evaluation metric alongside the quality rubric.**

### Production serving complexity

**Risk level: LOW for Phase 2 (experiment only).** In production, LoRA adds latency at inference time (LoRA weights must be loaded per call) and limits concurrent throughput. FAL's hosted serving handles LoRA loading automatically, so cold-start cost is the main concern. Multi-LoRA stacking (mode-specific LoRAs loaded per lane) is technically supported via the `loras: Array<LoraWeight>` API but adds complexity. For Phase 2 experiment purposes, this is not a blocker — serving complexity is a Phase 3 concern.

---

## Part G — Summary Tables

### Files changed

- `docs/round1-v2-lora-feasibility-audit.md` — this document (new).
- `docs/adr/` — directory created (empty; no ADR written for this audit — the single recommendation below serves that purpose).

### Dataset readiness summary

| Status | Detail |
|---|---|
| Total refs | 161 (all flattened rasters) |
| Training-ready without preprocessing | **16** (low-risk cluster) |
| Training-ready after text removal | **~35–50** (estimated if medium-risk refs are hand-masked) |
| Training-ready if source files exist | **Unknown — requires answering source-file questions** |
| Minimum viable training set | **30 clean images** |
| Current state vs. minimum | **Below minimum** |

### Source / layered asset findings

**No layered source files in the repo.** All 161 references are flattened JPG/PNG. Whether layered source files exist externally is unknown — user must answer 5 questions listed in Part A before training can proceed responsibly.

### Provider capability summary

| Capability | Status |
|---|---|
| Multi-image reference conditioning | ✅ `nano-banana-pro/edit`, `nano-banana/edit` |
| Style LoRA training on Flux Dev | ✅ `flux-lora-fast-training` |
| Style LoRA training on Flux Krea | ✅ `flux-krea-trainer` (preferred — stronger base) |
| LoRA inference (Flux Dev) | ✅ `flux-lora` |
| LoRA inference (Flux Krea) | ✅ `flux-krea-lora` |
| Imagen 4 text-to-image | ✅ `imagen4/preview` (no LoRA, no multi-image) |
| Imagen 4 LoRA | ❌ no training endpoint available |
| All above accessible without new provider integration | ✅ current `@fal-ai/client` v1.9.5 |

### Alt-model skip/run decision and justification

**Run Imagen 4 benchmark first ($1 ceiling, 4 calls).** Imagen 4 has documented stronger prompt-following than Flux Dev and is accessible in the current stack. This $0.32 test answers whether the quality floor improves at the base-model level before spending $3–$8 on LoRA training. If Imagen 4 passes 2/4, the LoRA training target changes. If it fails, LoRA on Flux Krea is the next test.

### LoRA feasibility verdict

**Not yet viable given current dataset.** 16 clean training images is below the practical minimum for a reliable style LoRA. Dataset preparation (either source-file extraction or manual text removal) must precede training. Once dataset is at 30+ clean images, LoRA on Flux Krea is the correct experiment to run.

### Phase 2 hard cost ceiling

- Sub-experiment 2a (Imagen 4 benchmark): **$1.00 hard ceiling**
- Sub-experiment 2b (LoRA training + evaluation, if 2a and dataset prep complete): **$8.00 hard ceiling**
- **Total Phase 2: $9.00 hard ceiling**
- **Required fal.ai balance before starting: $14 ($9 + $5 buffer)**

### Recommended next paid experiment

Run the Imagen 4 benchmark (4 calls matching Phase 1 modes exactly, text-to-image only, `fal-ai/imagen4/preview`, 16:9, same prompts, same quality bar, same rubric).

### Git discipline

- Committed: see commit below
- Pushed: no (branch is 1 ahead of origin; push on user request)
- Working tree: clean (tracked files only; `.claude/` and `dev.db` remain untracked, untouched)

---

## Single Recommendation

**Recommendation 2: Do not train yet. Complete dataset preparation work first, AND run the Imagen 4 benchmark first.**

Specifically, in order:

1. **Immediately (no cost):** Answer the 5 source-file questions in Part A. If layered source files exist, locate and export clean text-free background plates for the 30–40 strongest references across all 7 mode clusters. This is the dataset prep work that must precede training.

2. **Next paid experiment ($1 ceiling):** Run the Imagen 4 benchmark — 4 calls using `fal-ai/imagen4/preview`, 16:9, same 4 mode prompts from Phase 1, no reference conditioning. Score against the same rubric. If ≥2/4 pass, Imagen 4 becomes the primary inference model and LoRA training target question shifts to "LoRA on top of what base?". If 0–1/4 pass, the problem is confirmed as a training/conditioning problem, not a base-model-selection problem, and dataset prep becomes the sole blocker.

3. **After benchmark result AND dataset prep complete:** Proceed to Sub-experiment 2b — LoRA training on `fal-ai/flux-krea-trainer` with the clean dataset, evaluation against Phase 1 quality bar, $8 ceiling.

**Do not start LoRA training before both (1) and (2) are resolved.**
