import { ChurchBrandKitForm } from "@/components/church-brand-kit-form";
import { parsePaletteJson } from "@/lib/brand-kit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await requireSession();

  const organizationBrandKit = await prisma.organizationBrandKit.findUnique({
    where: {
      organizationId: session.organizationId
    },
    select: {
      websiteUrl: true,
      logoPath: true,
      paletteJson: true,
      typographyDirection: true
    }
  });

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-600">Manage church-wide defaults for every project.</p>
      </div>

      <ChurchBrandKitForm
        initialWebsiteUrl={organizationBrandKit?.websiteUrl}
        initialLogoPath={organizationBrandKit?.logoPath}
        initialPalette={parsePaletteJson(organizationBrandKit?.paletteJson)}
        initialTypographyDirection={organizationBrandKit?.typographyDirection || "match_site"}
      />
    </section>
  );
}
