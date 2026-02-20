import { prisma } from "@/lib/prisma";
import { normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";

export async function findFinalDesignForOrganization(projectId: string, organizationId: string) {
  return prisma.finalDesign.findFirst({
    where: {
      projectId,
      project: {
        organizationId
      }
    },
    select: {
      id: true,
      generationId: true,
      optionLabel: true,
      designJson: true
    }
  });
}

export function readStoredDesignDoc(input: unknown, optionLabel: string): DesignDoc {
  const normalized = normalizeDesignDoc(input);
  if (normalized) {
    return normalized;
  }

  return {
    width: 1920,
    height: 1080,
    background: {
      color: "#FFFFFF"
    },
    layers: [
      {
        type: "text",
        x: 140,
        y: 180,
        w: 1640,
        h: 200,
        text: optionLabel,
        fontSize: 88,
        fontFamily: "Inter",
        fontWeight: 700,
        color: "#0F172A",
        align: "left"
      },
      {
        type: "text",
        x: 140,
        y: 420,
        w: 1640,
        h: 220,
        text: "Stored design data could not be parsed. Re-approve a final option to regenerate exports.",
        fontSize: 36,
        fontFamily: "Inter",
        fontWeight: 400,
        color: "#334155",
        align: "left"
      }
    ]
  };
}
