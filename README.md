# GraceLed Design AI

Next.js (App Router) + TypeScript scaffold for GraceLed Design AI with TailwindCSS, Prisma, and organization-aware email/password auth.

## Stack

- Next.js App Router
- TypeScript
- TailwindCSS
- Prisma ORM
- SQLite for local development (default)
- PostgreSQL-ready for production via env config

## Routes

- `/login`
- `/signup`
- `/app/projects`
- `/app/projects/new`
- `/app/projects/[id]/brand`
- `/app/projects/[id]`
- `/app/projects/[id]/generations`
- `/app/projects/[id]/feedback?round=1&generationId=...`
- `/app/admin/presets`

## Data Model

Prisma models included:

- `User`
- `Organization`
- `Membership`
- `Project`
- `BrandKit`
- `Preset`
- `Generation`
- `Asset`

Also includes a `Session` model for simple cookie-based auth sessions.

## Project Fields

`Project` includes:

- `series_title` (required)
- `series_subtitle` (optional)
- `scripture_passages` (optional)
- `series_description` (optional)

## New Project Flow

1. Step 1 of 2 (`/app/projects/new`): create the project core fields.
2. Step 2 of 2 (`/app/projects/[id]/brand`): complete the brand kit.
3. Submit Brand Kit: redirect to `/app/projects/[id]`.

## BrandKit Fields

`BrandKit` includes:

- `id`
- `projectId`
- `organizationId`
- `websiteUrl`
- `logoPath` (relative file path, e.g. `uploads/logo.png`)
- `paletteJson` (stringified JSON array of hex color strings)
- `typographyDirection` enum:
  - `match_site`
  - `graceled_defaults`
- `createdAt`
- `updatedAt`

## Stub Generation Flow

1. Open a project at `/app/projects/[id]`.
2. In **Design Directions**, select exactly 3 preset lanes and click `Generate Round 1 (3 options)`.
3. App redirects to `/app/projects/[id]/generations` and shows Round 1 options (A/B/C) with placeholder previews.
4. Click `Choose this direction` on one option.
5. App opens `/app/projects/[id]/feedback?round=1&generationId=...`.
6. Add feedback + toggles, then click `Generate Round 2 (3 options)`.
7. App redirects back to `/app/projects/[id]/generations`, with Round 2 shown at the top.

Generated records are stubbed only:
- `Generation.status = COMPLETED`
- `Generation.input` stores project + brand kit fields, palette, typography direction, and selected preset keys.
- `Generation.output` stores placeholder preview paths and `"notes": "stub"`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Create/update local DB schema:

```bash
npm run prisma:push
```

5. Seed presets from `seed/presets.seed.json`:

```bash
npm run db:seed
```

6. Start dev server:

```bash
npm run dev
```

## Owned Reference Library

Place owned zip bundles here:

- `reference_zips/Folder 1.zip`
- `reference_zips/Folder 2.zip`
- `reference_zips/Folder 3.zip`

Then ingest:

```bash
npm run ingest:refs
```

This writes normalized assets to `public/reference-library/` and metadata to `data/reference-library.json`.

## Common Commands

```bash
npm run dev            # start dev server
npm run build          # production build
npm run start          # run production server
npm run lint           # lint (Next.js)
npm run verify:fonts   # check all manifest fonts exist in public/fonts
npm run test:font-assets
npm run test:font-render
npm run prisma:generate
npm run prisma:push
npm run prisma:migrate
npm run db:seed
npm run ingest:refs
```

## Adding Fonts

1. Create `public/fonts/`.
2. Add local `.woff2` files (no runtime downloads). Suggested categories:
   - Display serif: Playfair Display, DM Serif Display, Abril Fatface, or Fraunces
   - Editorial serif: Source Serif 4 or Newsreader
   - Condensed sans: Oswald, Archivo Narrow, or IBM Plex Sans Condensed
   - Grotesk: Space Grotesk, Sora, or Manrope
   - Slab: Roboto Slab or Arvo
3. Use consistent naming, for example:
   - `public/fonts/PlayfairDisplay-Regular.woff2`
   - `public/fonts/PlayfairDisplay-Bold.woff2`
4. Register/edit assets in `/Users/robrussell/Documents/GraceLed Designs AI/src/design/fonts/font-assets.ts`.
5. Validate before running previews/exports:

```bash
npm run verify:fonts
```

Notes:
- Preview rendering loads registered assets through global `@font-face` rules.
- SVG export paths embed requested font data for deterministic SVG->PNG rendering.
- If a requested font id is missing, typography falls back to the embedded default family set.

## Switching to PostgreSQL in Production

Update `.env` values:

```bash
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
```

Then run:

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Notes

- `/app/*` routes are session-protected via `requireSession()` in the authenticated layout.
- Renderer/generation engine is intentionally not implemented yet.
- Current focus is working auth/org flow, project setup UI, and core schema.
- Generated preview images are written to `/public/uploads` for local development; use object storage (for example S3/R2/GCS) in real deployments.
