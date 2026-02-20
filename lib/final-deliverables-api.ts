import type { DesignDoc } from "@/lib/design-doc";
import { getSession } from "@/lib/auth";
import { findFinalDesignForOrganization, readStoredDesignDoc } from "@/lib/final-design-store";

type FinalDesignLookupResult =
  | {
      ok: true;
      designDoc: DesignDoc;
      generationId: string | null;
      optionLabel: string;
    }
  | {
      ok: false;
      response: Response;
    };

export async function loadAuthorizedFinalDesign(projectId: string): Promise<FinalDesignLookupResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: new Response("Unauthorized", { status: 401 })
    };
  }

  const finalDesign = await findFinalDesignForOrganization(projectId, session.organizationId);
  if (!finalDesign) {
    return {
      ok: false,
      response: new Response("Final design not found", { status: 404 })
    };
  }

  return {
    ok: true,
    designDoc: readStoredDesignDoc(finalDesign.designJson, finalDesign.optionLabel),
    generationId: finalDesign.generationId,
    optionLabel: finalDesign.optionLabel
  };
}
