# Imagen 4 Modern Abstract Experiment — Round 1 V2

**Status: Closed. Path rejected. Feature flags remain off.**

---

## What was tested

A narrow end-to-end path through the Round 1 V2 engine using Imagen 4 (via FAL)
as the background generator for the `modern_abstract` design mode
(`prism_refraction_light_on_dark` prompt family).

The path was isolated behind two feature flags:
- `ENABLE_IMAGEN4_MODERN_ABSTRACT=true` (enables the Imagen 4 lane in the V2 engine)
- `V2_DEV_OVERRIDE_DESIGN_MODES=modern_abstract` (forces the design mode so the lane runs)

---

## Commands / env vars used

Run the V2 engine with Imagen 4 active:
```
ENABLE_IMAGEN4_MODERN_ABSTRACT=true V2_DEV_OVERRIDE_DESIGN_MODES=modern_abstract npm run dev
```

Inspect a failed generation record:
```
node --import tsx scripts/inspect-imagen4-failed-generation.mts <generationId>
```

Replay evaluator + waiver check against a fixture (no provider calls):
```
node --import tsx scripts/replay-imagen4-modern-abstract-fixture.mts [imagePath] [tone]
```

Replay compositor pipeline against a fixture (no provider calls):
```
node --import tsx scripts/replay-imagen4-modern-abstract-composition.mts [fixturePath]
```

---

## Raw image inspected

Fixture saved from live run on 2026-05-12:

```
test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png
generationId: 64323f20-d844-4e19-917d-779e307e037b
```

Evaluator results (from `scripts/inspect-imagen4-failed-generation.mts`):
- `textDetected: false` — no letterforms
- `structureScore: 0.814` — strong composition
- `marginScore: 0.386` — acceptable title-safe zones
- `edgeDensity: 0.061` — low noise
- `toneScore: 0` — failed `tone_implausible` under a light/vivid brief

The raw plate was rejected solely on tone. Structurally it was competent: no text,
clear visual structure, low edge noise. The aesthetic is dark prism/shattered-glass.

---

## Composed replay result

Command:
```
node --import tsx scripts/replay-imagen4-modern-abstract-composition.mts
```

Output: `tmp/imagen4-fixture-composition/wide-final.png` (not committed — tmp output)

Observation: The composed result does not meet the product quality bar.

- The typography lockup sat inside a shadow/scrim box that felt mechanical.
- The background reads as generic shattered-prism tech/luxury wallpaper.
- The plate does not feel meaningfully connected to the Gospel of John content.
- It does not resemble a professional, intentional sermon-series design direction.

---

## Why the path is rejected

Visual quality was the deciding factor. The compositor did not rescue the plate.
The evaluator correctly identified a text-free, structured plate — but "passes
evaluator" is not the same as "feels like a real church design team made this."

The background is generic tech/luxury wallpaper. The brief (Gospel of John,
light/vivid) and the output aesthetic are disconnected. Even with an improved
compositor or typography, the aesthetic category of "dark shattering glass prism"
is unlikely to be the right direction for a gospel-themed series.

---

## What was learned

**Imagen 4 mechanics work end-to-end:**
- The V2 engine override path (`resolve-round1-engine.ts`) dispatched to Imagen 4 correctly.
- The prompt structure (`build-imagen4-modern-abstract-prompt.ts`) produced text-free plates.
- The evaluator (`evaluate-scout.ts`) correctly graded structure and text freedom.
- The compositor pipeline (`composeLockupOnBackground`) ran without error.
- The fixture replay tooling (`scripts/replay-*`) is reusable for future experiments.

**Output quality / variance is insufficient:**
- Imagen 4 output skews toward tech/luxury wallpaper aesthetics.
- The aesthetic does not flex well to sermon-series briefs.
- Prompt engineering alone is unlikely to close the gap without fundamentally
  different prompts or a different Imagen 4 model / sampler configuration.

**Compositor did not rescue the plate:**
- The lockup recipe (`modern_abstract` override: `bold_modern`, `left` alignment)
  applied correctly, but the scrim box made the typography feel boxed-in.
- The palette sampler chose appropriate colors for the dark background, but the
  overall composed result was not distinctive.

**Evaluator is too blunt for dark plates:**
- The `tone_implausible` gate fires whenever luminance is very low, regardless of
  aesthetic intent. A dark prism plate is intentionally dark — the gate is not wrong
  to reject it under a `light` brief, but it can't distinguish "intentionally dark
  aesthetic" from "failed generation."
- Fixing this evaluator limitation would not solve the visual quality problem —
  the output would still be generic wallpaper.

---

## Decision

**Do not pursue Imagen 4 modern_abstract integration right now.**

- Feature flags remain off (`ENABLE_IMAGEN4_MODERN_ABSTRACT` defaults to false).
- No further paid Imagen 4 tests until strategy changes.
- The tone waiver (`checkImagen4ModernAbstractToneWaiver`) was removed from the
  runtime lane runner. It exists in `imagen4-modern-abstract-acceptance.ts` as a
  research artifact only.
- The fixture and replay scripts are preserved for future reference.

---

## Files preserved as research artifacts

| File | Purpose |
|------|---------|
| `lib/round1-v2/orchestrator/imagen4-modern-abstract-acceptance.ts` | Waiver logic (research only, not called at runtime) |
| `lib/round1-v2/orchestrator/imagen4-modern-abstract-acceptance.test.ts` | Evaluator characterisation + waiver unit tests |
| `lib/round1-v2/orchestrator/replay-imagen4-composition.test.ts` | Compositor pipeline smoke test against fixture |
| `scripts/replay-imagen4-modern-abstract-fixture.mts` | CLI replay: evaluator + waiver check against any PNG |
| `scripts/replay-imagen4-modern-abstract-composition.mts` | CLI replay: compositor pipeline against any PNG |
| `scripts/inspect-imagen4-failed-generation.mts` | CLI inspector for Imagen 4 DB records |
| `test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png` | Raw plate saved from live run |

---

## Paid calls made

One live Imagen 4 generation via FAL during the experiment run (2026-05-12).
No further paid calls were made during cleanup or replay.
