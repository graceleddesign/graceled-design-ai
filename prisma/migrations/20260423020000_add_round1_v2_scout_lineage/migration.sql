-- CreateTable
CREATE TABLE "ScoutRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "runSeed" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "grammarKey" TEXT NOT NULL,
    "diversityFamily" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "motifBinding" JSONB NOT NULL,
    "seed" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptSpecJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "assetPath" TEXT,
    "latencyMs" INTEGER,
    "providerModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScoutRun_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoutEval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scoutRunId" TEXT NOT NULL,
    "hardReject" BOOLEAN NOT NULL,
    "rejectReasons" JSONB NOT NULL,
    "textDetected" BOOLEAN NOT NULL,
    "toneScore" REAL NOT NULL,
    "structureScore" REAL NOT NULL,
    "marginScore" REAL NOT NULL,
    "compositeScore" REAL NOT NULL,
    "imageStatsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScoutEval_scoutRunId_fkey" FOREIGN KEY ("scoutRunId") REFERENCES "ScoutRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RebuildAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "scoutRunId" TEXT,
    "optionIndex" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "attemptOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "assetPath" TEXT,
    "latencyMs" INTEGER,
    "providerModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RebuildAttempt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RebuildAttempt_scoutRunId_fkey" FOREIGN KEY ("scoutRunId") REFERENCES "ScoutRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoutEval_scoutRunId_key" ON "ScoutEval"("scoutRunId");

-- CreateIndex
CREATE INDEX "ScoutRun_generationId_idx" ON "ScoutRun"("generationId");

-- CreateIndex
CREATE INDEX "ScoutRun_runSeed_idx" ON "ScoutRun"("runSeed");

-- CreateIndex
CREATE INDEX "RebuildAttempt_generationId_idx" ON "RebuildAttempt"("generationId");
