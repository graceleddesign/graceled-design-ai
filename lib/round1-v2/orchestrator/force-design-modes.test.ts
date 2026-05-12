import assert from "node:assert/strict";
import test from "node:test";
import { resolveForceDesignModes } from "./force-design-modes";
import { resolveImagen4ModernAbstractEnabled } from "../config";

// ── Env helpers ───────────────────────────────────────────────────────────────

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

function withNodeEnv(value: string, fn: () => void): void {
  withEnv("NODE_ENV", value, fn);
}

// ── 1. No env var → no override ───────────────────────────────────────────────

test("absent env var returns null (planner output unchanged)", () => {
  withEnv("ROUND1_V2_FORCE_DESIGN_MODES", undefined, () => {
    assert.equal(resolveForceDesignModes(), null);
  });
});

test("empty string env var returns null", () => {
  withEnv("ROUND1_V2_FORCE_DESIGN_MODES", "", () => {
    assert.equal(resolveForceDesignModes(), null);
  });
  withEnv("ROUND1_V2_FORCE_DESIGN_MODES", "   ", () => {
    assert.equal(resolveForceDesignModes(), null);
  });
});

// ── 2. Valid env var overrides A/B/C ─────────────────────────────────────────

test("valid 3-mode env var returns ok:true plan with correct lane modes", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result !== null);
      assert.ok(result.ok === true);
      if (!result.ok) return;
      assert.equal(result.plan.lanes[0].lane, "A");
      assert.equal(result.plan.lanes[0].mode, "modern_abstract");
      assert.equal(result.plan.lanes[1].lane, "B");
      assert.equal(result.plan.lanes[1].mode, "cinematic_atmospheric");
      assert.equal(result.plan.lanes[2].lane, "C");
      assert.equal(result.plan.lanes[2].mode, "graphic_symbol");
    }
  );
});

test("valid plan has allDistinct=true", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      assert.equal(result.plan.allDistinct, true);
    }
  );
});

test("valid plan summary matches A=… B=… C=… format", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      assert.equal(
        result.plan.summary,
        "A=modern_abstract B=cinematic_atmospheric C=graphic_symbol"
      );
    }
  );
});

test("spaces around commas are trimmed", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    " modern_abstract , cinematic_atmospheric , graphic_symbol ",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      assert.equal(result.plan.lanes[0].mode, "modern_abstract");
    }
  );
});

// ── 3. Invalid mode name is rejected ─────────────────────────────────────────

test("unknown mode name returns ok:false with reason", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,NOT_A_MODE,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result !== null);
      assert.ok(result?.ok === false);
      if (result?.ok !== false) return;
      assert.ok(result.reason.includes("NOT_A_MODE"));
    }
  );
});

// ── 4. Fewer than 3 modes rejected ───────────────────────────────────────────

test("fewer than 3 modes returns ok:false", () => {
  withEnv("ROUND1_V2_FORCE_DESIGN_MODES", "modern_abstract,cinematic_atmospheric", () => {
    const result = resolveForceDesignModes();
    assert.ok(result?.ok === false);
    if (result?.ok !== false) return;
    assert.ok(result.reason.includes("2"));
  });

  withEnv("ROUND1_V2_FORCE_DESIGN_MODES", "modern_abstract", () => {
    const result = resolveForceDesignModes();
    assert.ok(result?.ok === false);
  });
});

// ── 5. More than 3 modes rejected ────────────────────────────────────────────

test("more than 3 modes returns ok:false", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol,typography_led",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === false);
      if (result?.ok !== false) return;
      assert.ok(result.reason.includes("4"));
    }
  );
});

// ── 6. Duplicate modes rejected ──────────────────────────────────────────────

test("duplicate modes returns ok:false", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,modern_abstract,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === false);
      if (result?.ok !== false) return;
      assert.ok(result.reason.includes("duplicate"));
    }
  );

  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "graphic_symbol,graphic_symbol,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === false);
    }
  );
});

// ── 7. Production guard ───────────────────────────────────────────────────────

test("override is ignored when NODE_ENV=production", () => {
  withNodeEnv("production", () => {
    withEnv(
      "ROUND1_V2_FORCE_DESIGN_MODES",
      "modern_abstract,cinematic_atmospheric,graphic_symbol",
      () => {
        assert.equal(resolveForceDesignModes(), null);
      }
    );
  });
});

test("override is active in test environment", () => {
  withNodeEnv("test", () => {
    withEnv(
      "ROUND1_V2_FORCE_DESIGN_MODES",
      "modern_abstract,cinematic_atmospheric,graphic_symbol",
      () => {
        const result = resolveForceDesignModes();
        assert.ok(result?.ok === true);
      }
    );
  });
});

test("override is active in development environment", () => {
  withNodeEnv("development", () => {
    withEnv(
      "ROUND1_V2_FORCE_DESIGN_MODES",
      "modern_abstract,cinematic_atmospheric,graphic_symbol",
      () => {
        const result = resolveForceDesignModes();
        assert.ok(result?.ok === true);
      }
    );
  });
});

// ── 8. Forced metadata is present ────────────────────────────────────────────

test("forced lanes have forced=true and usedFallback=false", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      for (const lane of result.plan.lanes) {
        assert.equal(lane.forced, true);
        assert.equal(lane.usedFallback, false);
      }
    }
  );
});

test("forced lanes have rationale indicating forced override", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      for (const lane of result.plan.lanes) {
        assert.ok(
          lane.rationale.includes("forced"),
          `expected rationale to mention 'forced', got: "${lane.rationale}"`
        );
      }
    }
  );
});

test("forced plan detectedCharacteristics includes forced_by_env marker", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      assert.ok(result.plan.detectedCharacteristics.includes("forced_by_env"));
    }
  );
});

// ── 9. Imagen 4 eligibility when forced A=modern_abstract ────────────────────
//
// This verifies the two building blocks that together produce imagen4Lanes=1
// in the orchestrator without invoking the full orchestrator or any provider.

test("forced A=modern_abstract lane has mode=modern_abstract (Imagen 4 routing precondition)", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      const result = resolveForceDesignModes();
      assert.ok(result?.ok === true);
      if (!result?.ok) return;
      const laneA = result.plan.lanes.find((l) => l.lane === "A");
      assert.ok(laneA, "lane A must exist");
      assert.equal(laneA.mode, "modern_abstract");
    }
  );
});

test("resolveImagen4ModernAbstractEnabled=true + forced modern_abstract lane → imagen4Lanes=1", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", "true", () => {
        const result = resolveForceDesignModes();
        assert.ok(result?.ok === true);
        if (!result?.ok) return;

        const imagen4Enabled = resolveImagen4ModernAbstractEnabled();
        assert.equal(imagen4Enabled, true);

        // Mirror the orchestrator's isImagen4ModernAbstractLane predicate
        const isImagen4Lane = (mode: string) =>
          imagen4Enabled && mode === "modern_abstract";

        const imagen4Lanes = result.plan.lanes.filter((l) => isImagen4Lane(l.mode));
        assert.equal(
          imagen4Lanes.length,
          1,
          `expected 1 imagen4 lane, got ${imagen4Lanes.length}`
        );
        assert.equal(imagen4Lanes[0].lane, "A");
      });
    }
  );
});

test("imagen4Lanes=0 when IMAGEN4_MODERN_ABSTRACT_EXPERIMENT is absent", () => {
  withEnv(
    "ROUND1_V2_FORCE_DESIGN_MODES",
    "modern_abstract,cinematic_atmospheric,graphic_symbol",
    () => {
      withEnv("IMAGEN4_MODERN_ABSTRACT_EXPERIMENT", undefined, () => {
        const result = resolveForceDesignModes();
        assert.ok(result?.ok === true);
        if (!result?.ok) return;

        const imagen4Enabled = resolveImagen4ModernAbstractEnabled();
        assert.equal(imagen4Enabled, false);

        const isImagen4Lane = (mode: string) =>
          imagen4Enabled && mode === "modern_abstract";

        const imagen4Lanes = result.plan.lanes.filter((l) => isImagen4Lane(l.mode));
        assert.equal(imagen4Lanes.length, 0);
      });
    }
  );
});
