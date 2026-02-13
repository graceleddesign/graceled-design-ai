# Layout Templates

This document defines 10 production templates: `T1`, `T2`, `T3`, `T4`, `P1`, `P2`, `P3`, `A1`, `A2`, `K1`.

## T1 - Type Centered Main
- Series title/subtitle: centered lockup in the optical middle; subtitle directly under title with reduced size.
- Weekly module: not shown in main variant.
- Emphasis toggle: `title` mode increases series title weight/size; `quote` mode reserves center block for quote and reduces title prominence.
- Safe margins: keep all text inside format safe margins; maintain at least one title-line height from top/bottom margin edges.
- Supported background modes: `none`, `abstract`, `texture`.

## T2 - Type Centered Weekly Module
- Series title/subtitle: centered in upper half; subtitle tucked under title.
- Weekly module: centered lower-third card/stack for week title, scripture, or quote.
- Emphasis toggle: `title` favors series lockup; `quote` enlarges weekly quote block and compresses title stack.
- Safe margins: weekly module must clear bottom margin and preserve inter-block breathing room.
- Supported background modes: `none`, `abstract`, `texture`.

## T3 - Type Left Main
- Series title/subtitle: left-aligned anchor in left-center column.
- Weekly module: not shown in main variant.
- Emphasis toggle: `title` amplifies left title stack; `quote` introduces a larger quote area while keeping title as side anchor.
- Safe margins: align left text column to inner safe margin rail; avoid right-edge crowding.
- Supported background modes: `none`, `abstract`, `texture`.

## T4 - Type Left Weekly Module
- Series title/subtitle: left-aligned in upper-left to mid-left region.
- Weekly module: lower-left or lower-center module depending on aspect ratio.
- Emphasis toggle: `title` keeps module compact; `quote` expands module footprint and reduces title size.
- Safe margins: preserve clear left gutter and minimum bottom clearance for weekly module.
- Supported background modes: `none`, `abstract`, `texture`.

## P1 - Photo Veil Main
- Series title/subtitle: centered or slightly offset center over veiled photo.
- Weekly module: not shown in main variant.
- Emphasis toggle: `title` uses stronger title contrast block; `quote` shifts dominance to quote region with subdued title.
- Safe margins: avoid high-detail photo edges near text; keep text inside safe zone with veil-backed contrast.
- Supported background modes: `photo`.

## P2 - Photo Veil Weekly Module
- Series title/subtitle: upper-center or upper-left over veiled photo.
- Weekly module: lower-third module with strong contrast backing.
- Emphasis toggle: `title` emphasizes top lockup; `quote` enlarges weekly quote card and lightens title weight.
- Safe margins: module and title must both stay within safe margins with no overlap into high-noise zones.
- Supported background modes: `photo`.

## P3 - Photo Color Block Main
- Series title/subtitle: title overlays a color block band; subtitle sits within same band or directly below.
- Weekly module: not shown in main variant.
- Emphasis toggle: `title` increases color-block area for title; `quote` repurposes block as quote container.
- Safe margins: color block cannot cross safe-edge text boundaries; preserve side insets for readability.
- Supported background modes: `photo`.

## A1 - Abstract/Texture Field Main
- Series title/subtitle: centered or asymmetrical anchor based on texture calm zone.
- Weekly module: not shown in main variant.
- Emphasis toggle: `title` pushes typographic contrast; `quote` allocates larger calm-zone quote container.
- Safe margins: place text in low-noise calm zone and respect format safe margins.
- Supported background modes: `abstract`, `texture`.

## A2 - Abstract/Texture Weekly Module
- Series title/subtitle: top/upper-mid anchor over abstract or texture field.
- Weekly module: lower module aligned to calm zone; can be centered or left depending on composition.
- Emphasis toggle: `title` preserves headline-first hierarchy; `quote` elevates weekly quote with larger module and reduced title scale.
- Safe margins: weekly module must avoid high-texture areas and maintain bottom safe clearance.
- Supported background modes: `abstract`, `texture`.

## K1 - Podcast Lockup (inherits square_main background)
- Series title/subtitle: compact, short-title lockup centered or slightly above center for app thumbnails.
- Weekly module: never shown.
- Emphasis toggle: `title` keeps short title dominant; `quote` is ignored for podcast lockup to preserve simplicity.
- Safe margins: use generous internal padding for small-display legibility and icon-safe center composition.
- Supported background modes: inherits from `square_main` (`none`, `photo`, `abstract`, `texture`).
