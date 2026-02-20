-- CreateTable
CREATE TABLE "OrganizationBrandKit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "logoPath" TEXT,
    "paletteJson" TEXT NOT NULL,
    "typographyDirection" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationBrandKit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBrandKit_organizationId_key" ON "OrganizationBrandKit"("organizationId");
