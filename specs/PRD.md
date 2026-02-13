# Product Requirements Document (PRD)

## Product Summary
GraceLed Design AI generates ministry-ready series graphics and weekly variants from a single project setup. The MVP focuses on guided creation, fast iteration, and consistent multi-format export.

## MVP Scope
- Create a project with series and optional weekly content fields.
- Confirm brand direction before generation.
- Generate Round 1 with 3 design options.
- Capture user feedback and regenerate Round 2 with 3 refined options.
- Approve one option and export a full output package.

## User Flow
Create Project (Step 1 of 2) -> Brand Kit (Step 2 of 2) -> Round 1 (3 options) -> Feedback -> Round 2 (3 options) -> Approve -> Export

### New Project Setup
- Step 1 (`/app/projects/new`): collect required series info and create the project record.
- Step 2 (`/app/projects/[id]/brand`): collect website URL, optional logo upload, palette hex values, and typography direction.

## Output Package Spec (7 Outputs)
- `square_main` - 1080x1080
- `square_weekly` - 1080x1080
- `square_podcast` - 1080x1080 (inherits `square_main` background; simplified for small display)
- `widescreen_main` - 1920x1080
- `widescreen_weekly` - 1920x1080
- `vertical_main` - 1080x1920
- `vertical_weekly` - 1080x1920

## Content Fields
### Series Fields
- `series_title` (required)
- `series_subtitle` (optional)
- `scripture_passages` (optional)
- `series_description` (optional)

### Weekly Fields
- `week_title` (optional)
- `scripture_ref` (optional)
- `quote` (optional)

## Week-to-Week Behavior
- `series_title` always anchors the composition.
- Weekly module appears only if weekly fields are provided.

## Text Fitting Policy
- No hard character limits.
- Auto-resize text with minimum font-size floors per format/template.
- Fallback sequence:
1. increase line count
2. switch to quote-card variant
3. show "legibility may suffer" warning

## Podcast Variant Rules
- Inherits background from `square_main`.
- Contains either short series title lockup OR mark + short title.
- Excludes week title, scripture reference, and quote.
