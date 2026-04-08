# CLAUDE.md — GraceLed Design AI

## What this project is
GraceLed Design AI is a designer-grade sermon series graphics generator for churches.

This is not a generic “AI church graphics” app.
The standard is: could this reliably produce sermon series graphics that feel like a real church design team intentionally made them?

Core workflow:
- Round 1 A/B/C exploration
- user feedback and refinement
- multi-aspect final deliverables
- trustworthy finalization/export

Stack:
- Next.js
- TypeScript
- Prisma
- OpenAI image generation
- internal AI harness v1 already exists

## Active repo
`/Users/robrussell/code/GraceLed Designs AI`

Important:
- This is the only active development repo.
- Do not implement in `~/Documents/GraceLed Designs AI`.
- The `~/Documents` repo may still exist as a backup/reference, but it is not the working repo.

## Current stage
**Compile-fix cleanup in the clean `~/code` repo.**

Current rule:
- `npm run build` must pass before any canaries, benchmarks, or new feature work.
- Do not broaden scope while compile blockers still exist.

## How to work in this repo
1. One narrow task at a time.
2. No broad refactors unless explicitly requested.
3. After each change, run `npm run build`.
4. If build fails, report the exact next blocker:
   - file
   - line
   - error message
5. Stop after fixing the current blocker and surfacing the next one.
6. Do not fix unrelated issues while you are there.
7. Do not use `any`, broad unsafe casts, or fake placeholder values just to silence TypeScript unless absolutely unavoidable.
8. Prefer truthful type/signature fixes that preserve runtime behavior.

## Current working mode
We are currently in:
- repo stabilization complete enough to proceed in `~/code`
- compile-fix cleanup still in progress

We are NOT currently in:
- live canary testing
- full benchmark testing
- planner/style-family tuning
- typography overhaul
- export/finalize expansion
- provider expansion
- SundayOS integration work

## Build and verify commands
- `npm run lint`
- `npm run build`
- `npm run dev`

Use them in this order:
1. `npm run build` is the gate
2. `npm run dev` only matters after build passes

## Key files
- `app/app/projects/generation-actions.impl.ts`
  - main generation orchestration
- `app/app/projects/[id]/generations/page.tsx`
  - generation UI page
- `lib/direction-planner.ts`
  - direction/style planning
- `lib/production-valid-option.ts`
  - validation and output truthfulness types
- `lib/ai-harness/`
  - existing harness v1 infrastructure
- `lib/graphics-domain/`
  - generation-domain helpers
- `lib/graphics-evals/`
  - graphics evaluation logic

## Non-negotiable design principles
- **Honest success semantics**
  - fallback is not success
  - preview-only is not success
  - placeholder-like output is not success
- **Text-free backgrounds**
  - background art must not contain readable text or letterforms
- **Aspect-ratio integrity**
  - widescreen, square, and vertical are first-class deliverables
  - not sloppy crops or fake derivatives
- **No cheesy church design by default**
  - favor restraint, composition, premium modern church design sensibilities
- **Professional typography matters**
  - lockups should feel intentional, not auto-placed

## Current roadmap order
1. ✅ Work in the clean `~/code` repo
2. 🔄 Get `npm run build` green
3. ⬜ Commit compile-fix cleanup
4. ⬜ Resume provider/state-truthfulness hardening
5. ⬜ Single canary only when build and repo state justify it
6. ⬜ Round 1 survival / background yield improvement
7. ⬜ Planner/style-family tuning
8. ⬜ Typography deepening
9. ⬜ Export/finalize hardening

## Important historical guidance
Keep these principles in mind, but do not broaden into them during compile-fix mode:
- fallback must never be treated as true success
- real Round 1 success means three trustworthy options, not merely three files
- text detection should fail safe, not fail open
- preview semantics and canonical deliverable semantics must stay honest
- provider/state truthfulness matters before new generation features
- feature breadth is less important than trustworthy core quality

## What not to do
- Do not run live canaries until explicitly allowed
- Do not run the full benchmark matrix
- Do not introduce new providers or Hugging Face work
- Do not broaden AI harness scope right now
- Do not expand into SundayOS work
- Do not optimize for feature breadth over trustworthy core quality
- Do not treat previews, placeholders, or fallbacks as real success