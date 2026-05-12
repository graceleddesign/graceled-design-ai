import assert from "node:assert/strict";
import test from "node:test";
import { isImagen4DebugSaveEnabled } from "./save-imagen4-rejected";

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

test("save is enabled in development environment", () => {
  withEnv("NODE_ENV", "development", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", undefined, () => {
      assert.equal(isImagen4DebugSaveEnabled(), true);
    });
  });
});

test("save is enabled in test environment", () => {
  withEnv("NODE_ENV", "test", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", undefined, () => {
      assert.equal(isImagen4DebugSaveEnabled(), true);
    });
  });
});

test("save is disabled in production without explicit flag", () => {
  withEnv("NODE_ENV", "production", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", undefined, () => {
      assert.equal(isImagen4DebugSaveEnabled(), false);
    });
  });
});

test("save is disabled in production with IMAGEN4_DEBUG_REJECTED_OUTPUTS=false", () => {
  withEnv("NODE_ENV", "production", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "false", () => {
      assert.equal(isImagen4DebugSaveEnabled(), false);
    });
  });
});

test("save is enabled in production when IMAGEN4_DEBUG_REJECTED_OUTPUTS=true", () => {
  withEnv("NODE_ENV", "production", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "true", () => {
      assert.equal(isImagen4DebugSaveEnabled(), true);
    });
  });
});

test("IMAGEN4_DEBUG_REJECTED_OUTPUTS check is case-insensitive", () => {
  withEnv("NODE_ENV", "production", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "TRUE", () => {
      assert.equal(isImagen4DebugSaveEnabled(), true);
    });
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "True", () => {
      assert.equal(isImagen4DebugSaveEnabled(), true);
    });
  });
});

test("arbitrary string is not treated as true", () => {
  withEnv("NODE_ENV", "production", () => {
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "yes", () => {
      assert.equal(isImagen4DebugSaveEnabled(), false);
    });
    withEnv("IMAGEN4_DEBUG_REJECTED_OUTPUTS", "1", () => {
      assert.equal(isImagen4DebugSaveEnabled(), false);
    });
  });
});
