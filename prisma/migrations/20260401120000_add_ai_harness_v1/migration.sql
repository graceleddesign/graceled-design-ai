-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productKey" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "projectId" TEXT,
    "generationId" TEXT,
    "round" INTEGER,
    "laneKey" TEXT,
    "benchmarkCaseKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "metadataJson" JSONB
);

-- CreateTable
CREATE TABLE "AiAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorClass" TEXT,
    "providerStatusCode" INTEGER,
    "outputJson" JSONB,
    CONSTRAINT "AiAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiEvalResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "attemptId" TEXT,
    "evalKey" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" REAL,
    "reasonKey" TEXT,
    "detailsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiEvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiEvalResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AiAttempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "codeVersion" TEXT,
    "providerConfigVersion" TEXT,
    "summaryJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BenchmarkRun_caseKey_fkey" FOREIGN KEY ("caseKey") REFERENCES "BenchmarkCase" ("caseKey") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiRun_projectId_generationId_round_idx" ON "AiRun"("projectId", "generationId", "round");

-- CreateIndex
CREATE INDEX "AiAttempt_runId_operationKey_idx" ON "AiAttempt"("runId", "operationKey");

-- CreateIndex
CREATE INDEX "AiAttempt_providerKey_modelKey_idx" ON "AiAttempt"("providerKey", "modelKey");

-- CreateIndex
CREATE INDEX "AiEvalResult_runId_evalKey_idx" ON "AiEvalResult"("runId", "evalKey");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkCase_caseKey_key" ON "BenchmarkCase"("caseKey");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkRun_runId_key" ON "BenchmarkRun"("runId");
