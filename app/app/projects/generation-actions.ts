"use server";

import { redirect } from "next/navigation";

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
  const result = await generateRoundOneActionImpl(projectId, state, formData);
  // The V1 path calls redirect() inside the impl (throws NEXT_REDIRECT — never reaches here).
  // The V2 path returns a plain GenerationActionState object.
  // On V2 success, redirect so the page re-renders with fresh generation data.
  // On V2 error, return the error state so the form can display it.
  if (!result.error) {
    redirect(`/app/projects/${projectId}/generations`);
  }
  return result;
}

export async function generateRoundTwoAction(
  projectId: string,
  state: RoundFeedbackActionState,
  formData: FormData
): Promise<RoundFeedbackActionState> {
  const { generateRoundTwoAction: generateRoundTwoActionImpl } = await import("./generation-actions.impl");
  return generateRoundTwoActionImpl(projectId, state, formData);
}
