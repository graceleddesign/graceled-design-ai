-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "series_title" TEXT NOT NULL,
    "series_subtitle" TEXT,
    "scripture_passages" TEXT,
    "series_description" TEXT,
    "preferredAccentColors" TEXT,
    "avoidColors" TEXT,
    "designNotes" TEXT,
    "brandMode" TEXT NOT NULL DEFAULT 'fresh',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("avoidColors", "createdAt", "createdById", "designNotes", "id", "organizationId", "preferredAccentColors", "scripture_passages", "series_description", "series_subtitle", "series_title", "updatedAt") SELECT "avoidColors", "createdAt", "createdById", "designNotes", "id", "organizationId", "preferredAccentColors", "scripture_passages", "series_description", "series_subtitle", "series_title", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
