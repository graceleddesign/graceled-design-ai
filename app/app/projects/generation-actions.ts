"use server";

export type GenerationActionState = {
  error?: string;
};

export type RoundFeedbackActionState = {
  error?: string;
};

export async function generateRoundOneAction(
  projectId: string,
  state: GenerationActionState,
  formData: FormData
): Promise<GenerationActionState> {
  const { generateRoundOneAction: generateRoundOneActionImpl } = await import("./generation-actions.impl");
  return generateRoundOneActionImpl(projectId, state, formData);
}

export async function generateRoundTwoAction(
  projectId: string,
  state: RoundFeedbackActionState,
  formData: FormData
): Promise<RoundFeedbackActionState> {
  const { generateRoundTwoAction: generateRoundTwoActionImpl } = await import("./generation-actions.impl");
  return generateRoundTwoActionImpl(projectId, state, formData);
}
