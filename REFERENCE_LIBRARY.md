# Reference Library

## Zip Inputs
Place owned reference zip files at:

- `./reference_zips/Folder 1.zip`
- `./reference_zips/Folder 2.zip`
- `./reference_zips/Folder 3.zip`

Optional override:

- `REFERENCE_ZIP_DIR=/absolute/or/relative/path`

## Ingest

```bash
npm run ingest:refs
```

Pipeline behavior:

- reads all zip files in the zip folder
- ignores `__MACOSX`, dotfiles, and directories
- keeps image files only: `.jpg`, `.jpeg`, `.png`, `.webp`
- converts to normalized `.jpg` (sRGB, long edge max 1600, quality 82)
- writes images to `./public/reference-library/<sha1>.jpg`
- writes metadata index to `./data/reference-library.json`
- classifies each image style as one of:
  - `minimal`
  - `illustrative`
  - `photo`
  - `bold-typography`
  - `textured`

Each index entry includes:

- `id`
- `path`
- `width`
- `height`
- `sourceZip`
- `originalName`
- `styleTag`

Additional fields may be present (`styleTags`, `dHash`, `aspect`, `fileSize`) for retrieval and originality guard logic.

## Runtime usage

- A/B/C option lanes pull 1–3 references from this index:
  - `A`: minimal/clean
  - `B`: illustrative/line-art
  - `C`: photo-based
- Prompts include originality constraints and never copy references directly.
