import { NextResponse } from "next/server";
import { getIntegrationSettings } from "@/lib/db/store";
import { getCapabilityReport } from "@/lib/integrations/capabilities";
import { requireActor } from "@/lib/integrations/http";
import { INTEGRATION_FEATURES, type IntegrationFeature } from "@/types";

export const dynamic = "force-dynamic";

/** Fonctionnalités Microsoft 365 utilisables (sans détail de configuration). */
export async function GET() {
  const guard = await requireActor();
  if (!guard.ok) return guard.response;
  const report = await getCapabilityReport(await getIntegrationSettings());
  const usable = Object.fromEntries(
    INTEGRATION_FEATURES.map((feature) => [feature, report.features[feature].usable]),
  ) as Record<IntegrationFeature, boolean>;
  return NextResponse.json({ usable });
}
