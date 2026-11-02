import { NextResponse } from "next/server";
import {
  appendAuditEntries,
  getIntegrationSettings,
  listTeamsConversations,
  setIntegrationFeatures,
  updateIntegrationSettings,
} from "@/lib/db/store";
import { getCapabilityReport } from "@/lib/integrations/capabilities";
import { jsonError, requireAdmin } from "@/lib/integrations/http";
import { INTEGRATION_FEATURES, type IntegrationFeature } from "@/types";

export const dynamic = "force-dynamic";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function snapshot(force: boolean) {
  const settings = await getIntegrationSettings();
  const [capabilities, conversations] = await Promise.all([
    getCapabilityReport(settings, { force, probes: true }),
    listTeamsConversations(),
  ]);
  return {
    settings,
    capabilities,
    conversations: {
      total: conversations.length,
      personal: conversations.filter((ref) => ref.scope === "personal").length,
      channel: conversations.filter((ref) => ref.scope === "channel").length,
      lastActivityAt: conversations.map((ref) => ref.updatedAt).sort().pop() ?? null,
    },
  };
}

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const force = new URL(request.url).searchParams.get("force") === "1";
  return NextResponse.json(await snapshot(force));
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { actor, it } = guard.value;
  const body = (await request.json().catch(() => null)) as {
    features?: Partial<Record<IntegrationFeature, boolean>>;
    teamsAppCatalogId?: string | null;
  } | null;
  if (!body) return jsonError(it("errors.invalidBody"), 400);

  if (body.features) {
    const features = Object.fromEntries(
      Object.entries(body.features).filter(
        ([key, value]) => INTEGRATION_FEATURES.includes(key as IntegrationFeature) && typeof value === "boolean",
      ),
    ) as Partial<Record<IntegrationFeature, boolean>>;
    await setIntegrationFeatures(features, actor);
  }

  if (body.teamsAppCatalogId !== undefined) {
    const value = body.teamsAppCatalogId?.trim() || undefined;
    if (value && !GUID.test(value)) return jsonError(it("errors.invalidBody"), 400);
    await updateIntegrationSettings((settings) => {
      settings.teamsAppCatalogId = value;
    });
    await appendAuditEntries([
      {
        action: "integrations.teams_catalog_id",
        actorId: actor.id,
        actorName: actor.name,
        details: { teamsAppCatalogId: value ?? null },
      },
    ]);
  }

  return NextResponse.json({ ...(await snapshot(false)), message: it("admin.saved") });
}
