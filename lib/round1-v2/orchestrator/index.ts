import type { Round1Engine, Round1V2Result } from "../types";

export function resolveRound1Engine(projectOverride?: string | null): Round1Engine {
  const override = projectOverride?.trim().toLowerCase();
  if (override === "v2" || override === "v1") return override;
  const env = process.env.ROUND1_ENGINE?.trim().toLowerCase();
  return env === "v2" ? "v2" : "v1";
}

export class RoundOneV2NotImplementedError extends Error {
  constructor() {
    super("Round 1 V2 engine is not yet implemented");
    this.name = "RoundOneV2NotImplementedError";
  }
}

export async function runRoundOneV2(_projectId: string): Promise<Round1V2Result> {
  throw new RoundOneV2NotImplementedError();
}
