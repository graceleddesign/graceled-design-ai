import { normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { getSession } from "@/lib/auth";
import { findFinalDesignForOrganization } from "@/lib/final-design-store";
import {
  buildProductionBlockedMessage,
  resolveProductionValidOption,
  type GenerationAssetRecord,
  type ProductionValidOptionResult
} from "@/lib/production-valid-option";

type FinalDesignLookupResult =
  | {
      ok: true;
      designDoc: DesignDoc;
      generationId: string | null;
      generationAssets: GenerationAssetRecord[];
      generationValidation: ProductionValidOptionResult;
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

  const designDoc = normalizeDesignDoc(finalDesign.designJson);
  if (!designDoc) {
    return {
      ok: false,
      response: new Response(buildProductionBlockedMessage("Final design export", ["final_design_invalid"]), { status: 409 })
    };
  }
  if (!finalDesign.generationId || !finalDesign.generation) {
    return {
      ok: false,
      response: new Response("Final design is missing its source generation. Re-finalize a production-valid option.", { status: 409 })
    };
  }

  const generationValidation = resolveProductionValidOption({
    output: finalDesign.generation.output,
    dbStatus: finalDesign.generation.status,
    assets: finalDesign.generation.assets
  });
  if (!generationValidation.valid) {
    return {
      ok: false,
      response: new Response(buildProductionBlockedMessage("Final design export", generationValidation.export.invalidReasons), {
        status: 409
      })
    };
  }

  return {
    ok: true,
    designDoc,
    generationId: finalDesign.generationId,
    generationAssets: finalDesign.generation.assets,
    generationValidation,
    optionLabel: finalDesign.optionLabel
  };
}
