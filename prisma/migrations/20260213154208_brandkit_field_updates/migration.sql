-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BrandKit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "logoPath" TEXT,
    "paletteJson" TEXT NOT NULL,
    "typographyDirection" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandKit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BrandKit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BrandKit" (
    "createdAt",
    "id",
    "organizationId",
    "projectId",
    "websiteUrl",
    "logoPath",
    "paletteJson",
    "typographyDirection",
    "updatedAt"
)
SELECT
    "createdAt",
    "id",
    "organizationId",
    "projectId",
    "website_url",
    "logo_upload",
    COALESCE(CAST("palette" AS TEXT), '[]'),
    "typography_direction",
    "updatedAt"
FROM "BrandKit";
DROP TABLE "BrandKit";
ALTER TABLE "new_BrandKit" RENAME TO "BrandKit";
CREATE UNIQUE INDEX "BrandKit_projectId_key" ON "BrandKit"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
