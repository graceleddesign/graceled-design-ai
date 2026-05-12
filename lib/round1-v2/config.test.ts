import assert from "node:assert/strict";
import test from "node:test";
import { resolveImagen4ModernAbstractEnabled, ROUND1_V2_CONFIG } from "./config";

// resolveImagen4ModernAbstractEnabled reads process.env at call-time,
// so we can control it per-test. Each test saves/restores the original value.

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

test("static default in ROUND1_V2_CONFIG is false", () => {
  assert.equal(ROUND1_V2_CONFIG.enableImagen4ModernAbstractExperiment, false);
});

test("resolveImagen4ModernAbstractEnabled returns false when env var is absent", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", undefined, () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
});

test("resolveImagen4ModernAbstractEnabled returns true when env var is 'true'", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "true", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), true);
  });
});

test("resolveImagen4ModernAbstractEnabled returns false for 'false'", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "false", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
});

test("resolveImagen4ModernAbstractEnabled returns false for '0'", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "0", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
});

test("resolveImagen4ModernAbstractEnabled returns false for 'no'", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "no", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
});

test("resolveImagen4ModernAbstractEnabled returns false for arbitrary strings", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "yes", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "1", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "enabled", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), false);
  });
});

test("resolveImagen4ModernAbstractEnabled is case-insensitive for 'TRUE'", () => {
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "TRUE", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), true);
  });
  withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "True", () => {
    assert.equal(resolveImagen4ModernAbstractEnabled(), true);
  });
});

test("env var state is restored after each test (no leakage)", () => {
  // If a previous test leaked a 'true' value, this would fail.
  const saved = process.env.IMAGEN4_MODERN_ABSTRACT_EXPERIMENT;
  assert.ok(
    saved === undefined || saved !== "true",
    "IMAGEN4_MODERN_ABSTRACT_EXPERIMENT must not be 'true' at module scope"
  );
});
