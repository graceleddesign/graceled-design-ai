# Round 1 V2 — DesignMode Spec

Status: spec only. No generation, prompt, or validation code is changed by this document. Companion to `round1-v2-reference-taxonomy.md`.

## Why a DesignMode is needed

V2 today: prompt → cinematic widescreen background → typography compositor lays a title on top.

What the owned reference library actually shows: sermon series graphics are **identity systems**, where typography, motif, photo, and composition are decided **together**. Background-only generation cannot reach `bold_type`, `editorial_photo`, or `illustration` results. It produces cinematic backgrounds with weak lockups and calls them three options.

A DesignMode is the missing routing layer: a discrete decision, made before generation, about **what kind of design this is going to be**, that downstream prompt builders, compositors, and validators can branch on.

## DesignMode set (V2)

| DesignMode              | Source cluster(s)               | One-line identity                                                |
|-------------------------|----------------------------------|------------------------------------------------------------------|
| `typography_led`        | bold_type                        | The title *is* the design.                                       |
| `graphic_symbol`        | illustration (mark variant)      | A single confident vector mark + lockup.                         |
| `photo_composite`       | editorial_photo                  | Photography composed *with* type (knockout, layered, graded).    |
| `cinematic_atmospheric` | cinematic                        | Photographed scene as mood; type sits intentionally over it.     |
| `minimal_editorial`     | minimal                          | Restraint, white space, near-monochrome.                         |
| `modern_abstract`       | modern_abstract                  | Non-photo atmosphere: gradient, smoke, geometric pattern.        |
| `illustrative_collage`  | illustration (expressive variant)| Paint, torn paper, hand mark — fully committed expressive system.|
| `playful_seasonal`      | (cross-cluster, seasonal flag)   | Bright, energetic, holiday-leaning. Not a default lane.          |
| `retro_print` *(gated)* | retro_print                      | Vintage offset/print pastiche. **Experimental tier only.**        |

Eight modes are active for routing; `retro_print` exists in the enum but stays gated behind an experimental flag until reliability is proven.

---

## Per-mode specification

### 1. `typography_led`

- **What it is.** The wordmark/title is the artwork. Background is a tonal field, knockout, or quiet texture.
- **Reference anchors.** ref_0002, ref_0033 (Undivided), ref_0089 (Pray Like Jesus), ref_0009, ref_0020, ref_0021, ref_0037, ref_0041, ref_0046, ref_0090.
- **When to use.** Short, punchy titles. Expository series. Concept lives inside the title itself ("Undivided", "Leverage", "Tested"). Brief tone is bold/declarative.
- **When to avoid.** Long titles (>3 words display), narrative-driven series that need imagery, seasonal/celebratory briefs.
- **Prompt strategy.** Do not prompt for a "background." Prompt for a typographic composition: weight, case, letterform treatment (knockout, fill-with-texture, condensed, stencil), color contrast, single accent letter.
- **Compositor / lockup.** Type is generated as the artwork; compositor adds optional subtitle/tag ribbon only. No mark.
- **Typography role.** Hero. Carries 100% of the identity.
- **Motif role.** None, or a single tiny accent (chevron, dot) integrated into the type system.
- **Allowed visual language.** Solid fields, paper/parchment textures inside letterforms, single accent color, knockout fills.
- **Forbidden visual language.** Cinematic landscape backgrounds, photo-as-wallpaper, multiple decorative ornaments, drop shadows on the type that suggest a sticker-on-photo.
- **Common failure risks.** Generic cinematic field appearing behind the type; the type drifting into "title overlay" rather than "title is the design."
- **Validation signals needed.** Type bounding box covers ≥35% of canvas area; background tonal variance below threshold (no scenic content); accent-color count ≤3.

### 2. `graphic_symbol`

- **What it is.** A single, confident vector mark/symbol is the hero. Title sits in deliberate relationship to it.
- **Reference anchors.** ref_0023 (Meet Me at the Cross), ref_0011 (Heart Pleasing to God), ref_0148.
- **When to use.** Briefs with a strong concrete metaphor (cross, heart, lightbulb, key, door, mountain). Expository series that benefit from a memorable mark.
- **When to avoid.** Atmospheric/abstract briefs ("Awakening", "Focused"). Photo-driven concepts.
- **Prompt strategy.** Prompt for a single vector/geometric mark with composition guidance (off-center vs centered, scale, color logic). Treat type as a separate step.
- **Compositor / lockup.** Mark generated → type lockup placed beside or below per recipe.
- **Typography role.** Equal partner; never overlapping the mark.
- **Motif role.** *Is* the design. Exactly one mark, no secondary ornaments.
- **Allowed visual language.** Flat geometric shapes, faceted shards, monoline, two-tone fills, paper-cut.
- **Forbidden visual language.** Photographic content, multiple competing icons, generic clipart, drop-shadow chrome.
- **Common failure risks.** Mark reads as stock icon; mark + decorative-frame card + textured background pile-up (the "inset card" failure pattern from the library).
- **Validation signals needed.** Single dominant non-text shape detected; vector-flatness heuristic (low gradient frequency); negative space ≥30%.

### 3. `photo_composite`

- **What it is.** Photography is composed *with* type. Knockout type filled with image, layered architecture, tonally graded composite.
- **Reference anchors.** ref_0050 (Leverage), ref_0030 (Church on Mission), ref_0097, ref_0125 (Philippians), ref_0034, ref_0091, ref_0100, ref_0135.
- **When to use.** Briefs where a real-world subject (people, building, landscape) carries metaphor, but the design needs more than overlay-on-photo.
- **When to avoid.** Atmospheric mood-only briefs (those go to `cinematic_atmospheric`); abstract/conceptual briefs.
- **Prompt strategy.** Prompt for a photographic composite: knockout typography filled with image, or 2–4 photo panel layout, with explicit tonal grading and intentional negative space for the lockup.
- **Compositor / lockup.** Compositor handles knockout fill or panel layout; type is part of the composition decision, not added on top.
- **Typography role.** Structural — knockout container, panel divider, or anchor ribbon.
- **Motif role.** None or minimal; the photo+type relationship is the motif.
- **Allowed visual language.** Knockout type, monochrome-graded photography, multi-panel collage, duotone.
- **Forbidden visual language.** Generic photo + dropped title; high-saturation untreated stock; embossed/3D type.
- **Common failure risks.** Drifting back into `cinematic_atmospheric` (passive photo + overlaid title).
- **Validation signals needed.** Photo-content detection inside type bounds OR multi-region photo layout detected; tonal grading variance within target range.

### 4. `cinematic_atmospheric`

- **What it is.** A photographed scene carries mood. Type is overlaid with intention; photo dominates.
- **Reference anchors.** ref_0017 (Awakening), ref_0019 (Beloved), ref_0044 (Galatians), ref_0114 (Focused), ref_0157 (Signs of Hope), ref_0161 (Your Kingdom Come), ref_0066, ref_0083, ref_0101, ref_0107.
- **When to use.** Mood/atmosphere briefs ("Awakening", "Focused", "Hope"). Brief tone is contemplative, expansive.
- **When to avoid.** Title-driven concepts; declarative/punchy briefs; seasonal/celebratory.
- **Prompt strategy.** Prompt for a *composed* scene with explicit room for the lockup (negative-space target zone), tonal grading toward a single hue family, and a single dominant visual moment (sunrise, ridge, horizon).
- **Compositor / lockup.** Type placed in the pre-reserved negative-space zone with subtle gradient scrim if needed.
- **Typography role.** Restrained — overlay; never decorative.
- **Motif role.** Photographic subject is the motif; no added graphic ornament.
- **Allowed visual language.** Tonally graded photography, atmospheric particles, lens flare in moderation.
- **Forbidden visual language.** Stock-photo wallpaper without composition intent; readable letterforms in the photo (text purge); ornamental frames.
- **Common failure risks.** **This is V2's current default failure mode.** Without composition intent it becomes "background + title overlay."
- **Validation signals needed.** Negative-space zone large enough to host the lockup at minimum size; tonal-hue concentration; text-free background gate stays strict.

### 5. `minimal_editorial`

- **What it is.** Restraint. White space dominant, near-monochrome, single tonal field or quiet motion.
- **Reference anchors.** ref_0001 (Ephesians), ref_0048 (Future of the Church), ref_0143, ref_0062, ref_0115, ref_0118, ref_0139, ref_0150.
- **When to use.** Briefs with quiet/contemplative tone where confidence-in-nothing is the move. Expository books.
- **When to avoid.** Energetic briefs; seasonal; concept-heavy briefs that need a metaphor.
- **Prompt strategy.** Prompt for restraint explicitly: large negative space, single subject, near-monochrome palette, soft gradient or motion-blur tone.
- **Compositor / lockup.** Type centered or anchored to a clear baseline; minimal hierarchy.
- **Typography role.** Hero or co-hero with the empty field.
- **Motif role.** None, or a single subdued element (steeple silhouette, soft horizon).
- **Allowed visual language.** White/cream/dark single fields, soft gradients, gentle motion, single tonal photograph.
- **Forbidden visual language.** Multiple colors, decorative ornament, busy texture.
- **Common failure risks.** Reads as "unfinished" rather than "restrained" if the type is not strong enough.
- **Validation signals needed.** Background tonal variance below threshold; type weight/scale meeting a minimum; color-count ≤3.

### 6. `modern_abstract`

- **What it is.** Non-photographic atmosphere: gradient mesh, smoke, neon, geometric pattern.
- **Reference anchors.** ref_0004, ref_0072 (Easter neon), ref_0031, ref_0055, ref_0057, ref_0073, ref_0122.
- **When to use.** Concept briefs where photography would feel literal; energetic-but-modern briefs; Easter/seasonal-modern.
- **When to avoid.** Restraint briefs; expository series where atmosphere distracts.
- **Prompt strategy.** Prompt for non-photographic atmosphere with a clear visual logic (gradient mesh, smoke cloud, geometric tile) and reserved lockup space.
- **Compositor / lockup.** Type may include a single scripted accent word; otherwise restrained sans.
- **Typography role.** Co-equal with the atmospheric field.
- **Motif role.** The abstract system is the motif.
- **Allowed visual language.** Gradient meshes, smoke/cloud renders, neon strokes, geometric tiling.
- **Forbidden visual language.** Photography, literal scenic content, ornamental frames.
- **Common failure risks.** Slipping into AI-render cliché (purple-orange gradient blob).
- **Validation signals needed.** No photographic content detected; color palette within a designed range, not muddy.

### 7. `illustrative_collage`

- **What it is.** Fully committed expressive system: paint, torn paper, hand mark, sketch.
- **Reference anchors.** ref_0086 (Messy Church), ref_0038, ref_0051, ref_0105.
- **When to use.** Expressive briefs that benefit from human-made energy; series about mess, growth, struggle, creativity.
- **When to avoid.** Restraint briefs; corporate-toned briefs; cinematic briefs.
- **Prompt strategy.** Prompt for a single committed medium (paint, torn paper, marker) and *forbid* mixing media; type is treated in the same medium.
- **Compositor / lockup.** Type rendered in the same medium as the artwork; lockup is integrated, not overlaid.
- **Typography role.** Part of the medium.
- **Motif role.** The handmade medium *is* the motif.
- **Allowed visual language.** Paint splatter, torn paper, marker, ink, sketch.
- **Forbidden visual language.** Clean vector + paint hybrid; photographic content; clean sans on top of paint.
- **Common failure risks.** Half-committed (clean type dropped on a painted background).
- **Validation signals needed.** Texture-frequency signature consistent across foreground and background; no clean-vector regions.

### 8. `playful_seasonal`

- **What it is.** Bright, energetic, holiday-leaning compositions.
- **Reference anchors.** Cross-cluster — examples include ref_0072 Easter neon, ref_0086 Messy Church (overlap with illustrative), ref_0157.
- **When to use.** Series with explicit seasonal/celebratory briefs (Easter, Christmas, kickoff). Gated by a `seasonal` brief flag.
- **When to avoid.** Default expository teaching series.
- **Prompt strategy.** Higher color count budget; explicit energy cues; integrate seasonal motif (confetti, palm, light) carefully — one motif, fully committed.
- **Compositor / lockup.** Type can be scripted; mixed weights allowed.
- **Typography role.** Expressive partner.
- **Motif role.** One seasonal motif, scaled confidently.
- **Allowed visual language.** Higher saturation, scripted accents, confetti/palm/light motifs.
- **Forbidden visual language.** Generic stock holiday clipart; default everyday tone.
- **Common failure risks.** Cheesy church-design defaults; multi-motif clutter.
- **Validation signals needed.** Brief carries seasonal flag; otherwise mode is not selectable.

### 9. `retro_print` *(gated, experimental)*

- **What it is.** Vintage offset/print pastiche.
- **Reference anchors.** ref_0003 only — and the entire cluster is currently `experimental` in `curation.json`.
- **Status.** Mode exists in the enum for completeness but is **not selectable as a default lane**. Must be explicitly opted in. Do not promote until reliability is demonstrated.

---

## Why "background + title overlay" is insufficient

Stating it directly:

1. **`typography_led` is unreachable.** When the title *is* the design, generating a background and overlaying type produces a different artifact entirely — "title on a photo," not "title as identity." ref_0033 Undivided cannot exist without typography being a first-class generation target.
2. **`graphic_symbol` is unreachable.** A symbol-led design (ref_0023 Meet Me at the Cross) needs vector/shape generation with an off-center lockup recipe. Background-first generation cannot place a single confident mark; it produces scenic content where a mark belongs.
3. **`photo_composite` ≠ `cinematic_atmospheric`.** Knockout type filled with sky (ref_0050 Leverage) is a *composition decision*, not a postprocess. The compositor must know during generation that the photo will be inside the letterforms; otherwise the system always falls back to "photo behind title."
4. **`illustrative_collage` is unreachable.** Committed paint/handmade systems (ref_0086 Messy Church) require type rendered in the same medium. Adding clean type on a painted background reads as half-committed and is a known library failure pattern.
5. **`minimal_editorial` is reachable but currently miscalibrated.** The system can generate quiet fields, but without mode-aware validation it under-rewards restraint and over-rewards "more visual interest," which pushes outputs back toward cinematic.
6. **A/B/C lanes today are not distinct modes.** They are three samples of the same `cinematic_atmospheric` strategy. The reference library shows that real distinctness comes from mode-distinctness, not seed-distinctness.

The shift V2 needs: from generating **one widescreen background per lane** to making a **DesignMode decision per lane** and routing to a mode-specific generation pipeline.

---

## Recommended implementation sequence (staged)

1. **Step 1 — DesignMode enum + planner metadata.**
   - Add `DesignMode` TypeScript enum and Zod-or-equivalent type.
   - Extend the planner output (`lib/direction-planner.ts`) to carry a `designMode` field per lane plus a `confidence` score.
   - No generation behavior changes.

2. **Step 2 — Map A/B/C lanes to distinct DesignModes.**
   - Lane planner picks **three different modes** based on brief signals (tone, length, concrete-vs-abstract, seasonal flag).
   - Default mode triad for an expository brief: `typography_led`, `cinematic_atmospheric`, `graphic_symbol` (or `photo_composite`).
   - Still no generation change — modes are recorded and rendered in metadata only.

3. **Step 3 — Mode-specific scout/rebuild prompt builders.**
   - Replace the single prompt builder with a `buildPromptFor(mode, brief, …)` dispatch.
   - Per-mode prompt strategy from this spec (Allowed / Forbidden visual language sections feed directly into negative prompting).

4. **Step 4 — Mode-specific compositor / lockup recipes.**
   - Per-mode lockup recipes (knockout, mark+text, restraint-centered, integrated-medium).
   - Compositor consumes `designMode` and routes.

5. **Step 5 — Mode-aware validation / quality gates.**
   - Mode-specific signals from each spec entry (negative-space zone, tonal variance, mark-count, knockout detection).
   - Existing universal gates (text-purge, fallback-honesty, aspect integrity) stay strict and unchanged.

6. **Step 6 — Owned-reference anchoring.**
   - Per mode, retrieve anchors from the curated set (filter `curation.json` by the cluster mapping in this spec, tier `pro`).
   - Anchors inform prompt-side style guidance only; no copying.

7. **Step 7 — Typography quality system.**
   - For modes where typography is hero (`typography_led`, `minimal_editorial`, `photo_composite`), lift typography from "compositor finishing step" to a first-class generation concern with its own quality criteria.

---

## Acceptance criteria for the next coding task

**Task: "Add DesignMode routing and lane planning to V2 without changing generation behavior yet."** (Steps 1 and 2 above.)

A passing implementation must:

1. Add a `DesignMode` enum exporting exactly: `typography_led`, `graphic_symbol`, `photo_composite`, `cinematic_atmospheric`, `minimal_editorial`, `modern_abstract`, `illustrative_collage`, `playful_seasonal`, `retro_print`. Co-locate with the V2 planner types.
2. Add a `clusterToDesignMode` mapping function from `curation.json` cluster strings to the enum. Cover all 8 clusters; `retro_print` maps to its gated mode.
3. Extend the lane plan structure used by V2 to carry, per lane: `{ designMode, confidence, sourceClusterAnchors: string[] }`. `sourceClusterAnchors` is a list of curated `ref_*` ids selected from the matching cluster, tier `pro` only.
4. The lane planner returns **three distinct DesignModes** for A/B/C unless the brief carries the seasonal flag; in that case `playful_seasonal` may appear and one other mode may repeat-with-variant. `retro_print` is never selected unless an explicit experimental flag is set.
5. Mode selection is deterministic for a given brief (same brief → same triad). Test fixture covers: short-punchy brief, atmospheric brief, concrete-metaphor brief, seasonal brief.
6. **No change** to: prompt strings sent to the model, the compositor, validation gates, V1 code paths, or generation success/failure semantics. The new fields are recorded in metadata and surfaced in the generations UI/log only.
7. `npm run build` passes. `npm run lint` passes.
8. No new providers, no Hugging Face work, no SundayOS work, no canary runs.
9. Honest-success semantics preserved: a planned `designMode` is metadata, not a success signal. Fallback / preview-only / placeholder remain not-success regardless of mode.
10. A short note in the PR description states explicitly that generation behavior is unchanged in this step, with a link to this spec for the staged plan.
