import type { GenerationOptionStatus } from "@/lib/generation-state";

export async function settleUnexpectedClaimedGenerationFailure(params: {
  claimTimedOut: boolean;
  finalizeTimedOutBackgroundWork?: () => Promise<void>;
  persistTerminalFailure: () => Promise<boolean>;
  readPersistedStatus: () => Promise<GenerationOptionStatus>;
}): Promise<GenerationOptionStatus> {
  if (params.claimTimedOut) {
    await params.finalizeTimedOutBackgroundWork?.();
  }

  const persisted = await params.persistTerminalFailure();
  return persisted ? "FAILED_GENERATION" : await params.readPersistedStatus();
}
