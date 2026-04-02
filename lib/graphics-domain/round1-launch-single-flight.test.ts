import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  acquireRoundOneLaunchSingleFlight,
  attachRoundOneLaunchGenerationIds,
  finalizeRoundOneLaunchSingleFlight
} from "@/lib/graphics-domain/round1-launch-single-flight";

async function createTempPrismaClient(): Promise<{
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "graceled-round1-single-flight-"));
  const databasePath = path.join(tempDir, "test.db");
  const databaseUrl = `file:${databasePath}`;
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "name" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Organization" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Project" (
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
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Generation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "presetId" TEXT,
      "round" INTEGER NOT NULL DEFAULT 1,
      "status" TEXT NOT NULL DEFAULT 'QUEUED',
      "input" JSONB,
      "output" JSONB,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`
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
  `);

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

async function seedProject(prisma: PrismaClient, projectId: string): Promise<void> {
  await prisma.organization.create({
    data: {
      id: "org-test",
      name: "Test Org",
      slug: "test-org"
    }
  });
  await prisma.user.create({
    data: {
      id: "user-test",
      email: "tester@example.com",
      passwordHash: "hash"
    }
  });
  await prisma.project.create({
    data: {
      id: projectId,
      organizationId: "org-test",
      createdById: "user-test",
      series_title: "Round 1 single-flight"
    }
  });
}

test("round 1 launch single-flight blocks duplicate entry before and after the first triplet is created, then allows a later fresh launch", async () => {
  const { prisma, cleanup } = await createTempPrismaClient();

  try {
    const projectId = "project-round1";
    await seedProject(prisma, projectId);

    const firstAcquire = await acquireRoundOneLaunchSingleFlight({
      prisma,
      projectId
    });
    if (firstAcquire.kind !== "acquired") {
      assert.fail("expected the first Round 1 launch acquisition to succeed");
    }

    const duplicateBeforeCreate = await acquireRoundOneLaunchSingleFlight({
      prisma,
      projectId
    });
    if (duplicateBeforeCreate.kind !== "duplicate") {
      assert.fail("expected duplicate entry before generation creation to short-circuit");
    }
    assert.equal(duplicateBeforeCreate.reason, "launch-marker-in-flight");
    assert.equal(await prisma.generation.count({ where: { projectId, round: 1 } }), 0);

    const generationIds = ["gen-round1-a", "gen-round1-b", "gen-round1-c"];
    for (const generationId of generationIds) {
      await prisma.generation.create({
        data: {
          id: generationId,
          projectId,
          round: 1,
          status: "QUEUED"
        }
      });
    }

    assert.equal(
      await attachRoundOneLaunchGenerationIds({
        prisma,
        lease: firstAcquire.lease,
        generationIds
      }),
      true
    );

    const duplicateWhileRowsActive = await acquireRoundOneLaunchSingleFlight({
      prisma,
      projectId
    });
    if (duplicateWhileRowsActive.kind !== "duplicate") {
      assert.fail("expected duplicate entry with active generation rows to short-circuit");
    }
    assert.equal(duplicateWhileRowsActive.reason, "active-generation-cluster");
    assert.deepEqual(duplicateWhileRowsActive.existingGenerationIds, generationIds);
    assert.equal(await prisma.generation.count({ where: { projectId, round: 1 } }), 3);

    await prisma.generation.updateMany({
      where: {
        projectId,
        round: 1
      },
      data: {
        status: "COMPLETED"
      }
    });
    assert.equal(
      await finalizeRoundOneLaunchSingleFlight({
        prisma,
        lease: firstAcquire.lease,
        terminalStatus: "COMPLETED",
        generationIds,
        note: "round_settled"
      }),
      true
    );

    const freshAcquireAfterSettlement = await acquireRoundOneLaunchSingleFlight({
      prisma,
      projectId
    });
    if (freshAcquireAfterSettlement.kind !== "acquired") {
      assert.fail("expected a fresh Round 1 launch to acquire after settlement");
    }
    assert.notEqual(freshAcquireAfterSettlement.lease.launchToken, firstAcquire.lease.launchToken);
  } finally {
    await cleanup();
  }
});
