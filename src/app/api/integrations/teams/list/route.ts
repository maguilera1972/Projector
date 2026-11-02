import { NextResponse } from "next/server";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getIntegrationSettings } from "@/lib/db/store";
import { checkFeature } from "@/lib/integrations/capabilities";
import { graphFailure, jsonError, requireActor, HTTP_FEATURE_UNAVAILABLE } from "@/lib/integrations/http";
import { listExistingTeams } from "@/lib/teams/workspace";

export const dynamic = "force-dynamic";

/** Équipes Teams existantes (mode « canal dans une équipe existante »). */
export async function GET() {
  const guard = await requireActor();
  if (!guard.ok) return guard.response;
  const { actor, t, it } = guard.value;
  if (!hasPermission(actor, PERMISSIONS.PROJECTS_WRITE)) return jsonError(t("common.accessDenied"), 403);
  const check = await checkFeature("workspaces", await getIntegrationSettings());
  if (!check.ok) return jsonError(it("workspace.unavailable", { reason: check.message }), HTTP_FEATURE_UNAVAILABLE);
  try {
    return NextResponse.json({ teams: await listExistingTeams() });
  } catch (error) {
    return graphFailure(error);
  }
}
