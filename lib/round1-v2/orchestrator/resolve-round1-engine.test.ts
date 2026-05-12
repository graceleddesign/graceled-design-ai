import assert from "node:assert/strict";
import test from "node:test";
import { resolveRound1Engine } from "./index";

// resolveRound1Engine reads process.env at call-time, so we can control it
// per-test. Each test saves/restores the original value.

function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

// ── Default selection ─────────────────────────────────────────────────────────

test("default: no project override, no ROUND1_ENGINE env → v1", () => {
  withEnv("ROUND1_ENGINE", undefined, () => {
    assert.equal(resolveRound1Engine(null), "v1");
    assert.equal(resolveRound1Engine(undefined), "v1");
  });
});

test("default: ROUND1_ENGINE absent, empty project override → v1", () => {
  withEnv("ROUND1_ENGINE", undefined, () => {
    assert.equal(resolveRound1Engine(""), "v1");
    assert.equal(resolveRound1Engine("  "), "v1");
  });
});

// ── Env-var override ──────────────────────────────────────────────────────────

test("ROUND1_ENGINE=v2 with no project override → v2", () => {
  withEnv("ROUND1_ENGINE", "v2", () => {
    assert.equal(resolveRound1Engine(null), "v2");
    assert.equal(resolveRound1Engine(undefined), "v2");
  });
});

test("ROUND1_ENGINE=v2 is case-insensitive", () => {
  withEnv("ROUND1_ENGINE", "V2", () => {
    assert.equal(resolveRound1Engine(null), "v2");
  });
});

test("ROUND1_ENGINE=v1 with no project override → v1", () => {
  withEnv("ROUND1_ENGINE", "v1", () => {
    assert.equal(resolveRound1Engine(null), "v1");
  });
});

test("ROUND1_ENGINE=anything-else with no project override → v1 (safe default)", () => {
  withEnv("ROUND1_ENGINE", "v3", () => {
    assert.equal(resolveRound1Engine(null), "v1");
  });
  withEnv("ROUND1_ENGINE", "true", () => {
    assert.equal(resolveRound1Engine(null), "v1");
  });
});

// ── Project override ──────────────────────────────────────────────────────────

test("project override 'v2' → v2 regardless of env", () => {
  withEnv("ROUND1_ENGINE", undefined, () => {
    assert.equal(resolveRound1Engine("v2"), "v2");
  });
  withEnv("ROUND1_ENGINE", "v1", () => {
    assert.equal(resolveRound1Engine("v2"), "v2");
  });
});

test("project override 'v1' → v1 even when ROUND1_ENGINE=v2", () => {
  withEnv("ROUND1_ENGINE", "v2", () => {
    assert.equal(resolveRound1Engine("v1"), "v1");
  });
});

test("project override is case-insensitive", () => {
  withEnv("ROUND1_ENGINE", undefined, () => {
    assert.equal(resolveRound1Engine("V2"), "v2");
    assert.equal(resolveRound1Engine("V1"), "v1");
  });
});

test("project override takes precedence over ROUND1_ENGINE env var", () => {
  withEnv("ROUND1_ENGINE", "v2", () => {
    assert.equal(resolveRound1Engine("v1"), "v1");
  });
  withEnv("ROUND1_ENGINE", "v1", () => {
    assert.equal(resolveRound1Engine("v2"), "v2");
  });
});

// ── Critical: IMAGEN4 flag alone does NOT force V2 ───────────────────────────
//
// This documents the root cause of the failed live test:
// running `IMAGEN4_MODERN_ABSTRACT_EXPERIMENT=true npm run dev` does NOT cause
// V2 to be selected. The Imagen 4 flag only matters INSIDE the V2 orchestrator.
// You must ALSO set ROUND1_ENGINE=v2 (or set Project.round1EngineOverride='v2').

test("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT alone does not change engine selection", () => {
  withEnv("ROUND1_ENGINE", undefined, () => {
    withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "true", () => {
      // Engine is still v1 — the Imagen 4 flag is orthogonal to engine selection.
      assert.equal(resolveRound1Engine(null), "v1");
      assert.equal(resolveRound1Engine(undefined), "v1");
    });
  });
});

test("V2 + IMAGEN4 flag: both env vars set → v2 engine (Imagen 4 eligible)", () => {
  withEnv("ROUND1_ENGINE", "v2", () => {
    withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "true", () => {
      // V2 is selected. Inside the orchestrator, modern_abstract lanes will
      // be routed to Imagen 4 instead of local/scout paths.
      assert.equal(resolveRound1Engine(null), "v2");
    });
  });
});
