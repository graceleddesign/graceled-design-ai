# Round 1 V2 — Owned Reference Library Taxonomy

Status: report only. No generation, prompt, or validation code is changed by this document.

## Library scope

- Total normalized references in `reference_library/index.json`: **161**
- Curated entries in `reference_library/curation.json`: **62** (55 `pro`, 7 `experimental`)
- Thumbs available at `public/reference-thumbs/ref_*.png` (161 files)
- Existing `styleTags` on the index are nearly empty (only 4 minimal / 4 typography); the trustworthy taxonomy signal lives in `curation.json` clusters, not the index tags.

### Existing curated cluster distribution (`curation.json`)

| Cluster            | Count | Pro | Notes                                                                 |
|--------------------|-------|-----|-----------------------------------------------------------------------|
| bold_type          | 14    | 14  | Largest pro group. Display-type-led identity systems.                 |
| cinematic          | 10    | 10  | Photographic atmosphere with text overlay.                            |
| editorial_photo    |  8    |  8  | Photo as the design itself, not as backdrop.                          |
| illustration       |  8    |  8  | Vector / shape / hand systems carrying the identity.                  |
| minimal            |  8    |  8  | Restraint-led, white space or single tonal field.                     |
| modern_abstract    |  7    |  7  | Geometric or atmospheric abstraction; no photo.                       |
| retro_print        |  6    |  0  | All experimental — vintage type/print pastiche, currently unreliable. |
| architectural      |  1    |  0  | Lone outlier, not a cluster yet.                                      |

The remaining ~99 references are uncurated. They are visually present in the library but should not be treated as anchors until they are tier-tagged.

## What the library is actually doing (designer read)

Sampling broadly across the 8 clusters (representative thumbs reviewed: ref_0001, 0002, 0003, 0004, 0009, 0011, 0016, 0017, 0019, 0023, 0030, 0033, 0044, 0048, 0050, 0072, 0086, 0089, 0097, 0100, 0114, 0125, 0143, 0148, 0157, 0161):

### Recurring design modes (observed)

1. **Display typography as the artwork.** A wordmark or treated title carries the identity; background is a tonal field, knockout, or quiet texture. Color is restrained to 1–3 hues, often with a single accent letter. (ref_0002, 0033, 0089)
2. **Graphic symbol / mark + lockup.** A vector shape (cross, heart, geometric mark) is the hero; type sits in deliberate relationship to it, often inside a frame. (ref_0011, 0023, 0148)
3. **Photo composite / editorial photo.** Photography is composed — knockout type, layered architecture, tonally graded — not used as a generic backdrop. (ref_0030, 0050, 0097, 0125)
4. **Cinematic atmospheric.** A photographed scene (sunrise, forest, sea, space) carries mood; type is overlaid with intention but the photograph dominates. (ref_0017, 0019, 0044, 0114, 0157, 0161)
5. **Modern abstract / atmospheric non-photo.** Smoke, neon, gradient mesh, geometric pattern. No photographic content. (ref_0004, 0072)
6. **Minimal editorial.** White space dominant, single subject or wordmark, near-monochrome palette, restraint as the message. (ref_0001, 0048, 0143)
7. **Illustrative / collage / hand-made.** Paint, torn paper, flat illustration, sketch — expressive and seasonal-leaning. (ref_0086 Messy Church)
8. **Retro print pastiche.** Vintage offset/print conventions. Present but **all experimental tier** — currently the weakest cluster.

### Composition patterns

- **Centered title block** with breathing room on both sides (most cinematic and minimal entries).
- **Knockout type** where photograph or texture fills letterforms (ref_0050 Leverage, ref_0089 Pray Like Jesus).
- **Inset frame / card** holding the title over a textured field (ref_0009 Acts, ref_0011, ref_0148). This pattern is very common but is also where the library's **weakest, most-generic** entries cluster.
- **Mark + flanking text** with the symbol off-center and title pulled to one side (ref_0044 Galatians).
- **Layered photo grid** with type cutting across panels (ref_0125 Philippians).
- **Single hero symbol on near-empty field** (ref_0023 Meet Me At The Cross).

### Typography roles

- **Title-as-identity** — heavy display sans, condensed, or stencil; often the entire design (bold_type cluster).
- **Title-over-photo** — clean sans or thin serif overlaid on cinematic image with subtle gradient/blur to protect legibility.
- **Title-with-script-accent** — a single scripted word ("to God", "Easter") as a soft counterweight to a sans hierarchy (ref_0011, ref_0004).
- **Frame-anchored title** — type lives inside a rectangle/badge that is part of the composition.
- **Knockout / fill-with-image** — type as window into another layer.

### Motif strategies

- Motifs are usually **a single confident graphic element** (cross, heart, lightbulb, trumpet, speech bubble, abstract polygon mark), not a swarm of decorative accents.
- The strongest entries either (a) commit fully to a graphic motif, or (b) commit fully to a photograph and let typography be the only graphic element. Hybrid "background + small ornament" is rare.

### Color behaviors

- Two- or three-color systems dominate. Pure black/white + one chromatic accent is common.
- Photographic entries are tonally graded toward a single hue family (warm sunrise, cool forest, dusty desert).
- The library avoids saturated rainbow gradients except in deliberate playful/seasonal pieces (ref_0072 Easter neon, ref_0086 Messy Church).

### Image / photo usage

- Photo is used as **subject** (editorial_photo, ref_0125) or **atmosphere** (cinematic, ref_0017) — both intentional.
- Photo is rarely used as a passive cinematic wallpaper with a title slapped on. Where that pattern shows up (e.g. ref_0044 Galatians forest + logo), it is among the weakest expressions of the cluster.

### Illustration / stylization usage

- When illustration appears, it is committed: flat geometric (ref_0023), heavily styled paint (ref_0086), or anatomical/decorative ornament (ref_0148). There is no half-illustrated middle ground.

### Restraint vs expressive range

- The library spans from extreme restraint (ref_0001 Ephesians, ref_0048 Future of the Church) to fully expressive (ref_0086 Messy Church, ref_0072 Easter).
- The **trustworthy default** sits closer to restraint. Expressive modes work, but only when the entire system commits.

### Weak / common failure patterns observed in the library

- **Inset card with bevel/frame over textured background** — appears repeatedly (e.g. ref_0011 heart card, ref_0148 anatomical heart with bevel-corner box, ref_0030 Church on Mission with rounded badge). Reads as a stock template more than an identity.
- **Cinematic photo + dropped logo + thin sans subtitle** — the exact V1/V2 trap. Present but consistently underwhelming.
- **Decorative outlined rectangle frame** with chevrons pointing to the title (ref_0009 Acts) — feels mid-2010s.
- **Retro print pastiche** — the entire cluster is currently experimental tier; the look is hard to land without strong discipline.

### Strongest examples and what makes them work

| ref     | Cluster         | Why it works                                                                 |
|---------|-----------------|------------------------------------------------------------------------------|
| ref_0033 Undivided     | bold_type       | Single typographic gesture (the inverted V) is the entire concept. Black/white + one yellow accent. No background needed. |
| ref_0001 Ephesians     | minimal         | Restraint. Horizontal motion blur reads as wind/spirit. Type is the subject. |
| ref_0050 Leverage      | editorial_photo | Knockout type filled with sky carries the metaphor; thin tag ribbon anchors. |
| ref_0023 Meet Me…Cross | illustration    | Geometric cross built from colored shards; quiet right-side lockup; nothing else needed. |
| ref_0017 Awakening     | cinematic       | Sun-flare composition is composed for the title's bowl; not a generic landscape. |
| ref_0089 Pray Like Jesus | bold_type     | Type filled with parchment/scripture inside the letterforms. Concept lives inside the type. |
| ref_0086 Messy Church  | illustration    | Fully committed paint-splatter system; restraint everywhere except the title. |
| ref_0143 Future of Church | minimal      | Almost-white field, single steeple, gradient-tinted type — confidence in nothing. |

The pattern: **strongest = one idea, fully committed.** Weakest = "background + title overlay + small ornament."

## Implications for V2

1. The library is **not a background library**. It is a library of **designed identity systems**. V2 currently treats it as the former, which is the root of why output reads as cinematic wallpaper.
2. The 8 curated clusters are a real taxonomy and survive a designer read. They map cleanly to the DesignMode set proposed in `round1-v2-design-mode-spec.md`.
3. `bold_type`, `editorial_photo`, and `illustration` cannot be reached by background-only generation. They require typography, knockout/composite, or vector-shape behavior to be first-class outputs of the system, not post-hoc overlays.
4. `retro_print` should stay gated as experimental until the system can sustain a committed retro pastiche; do not promote it to a default lane.
5. The "inset card with bevel" pattern that recurs in the library should be treated as a **risk pattern** to avoid in V2 generation, not a target.
