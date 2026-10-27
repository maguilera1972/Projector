import { NextResponse } from "next/server";
import { getIntegrationSettings, setProjectTeamsWorkspace } from "@/lib/db/store";
import { checkFeature } from "@/lib/integrations/capabilities";
import { graphFailure, jsonError, requireProjectManager } from "@/lib/integrations/http";
import { syncTeamMembers } from "@/lib/teams/workspace";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Synchronise les membres de l'équipe Teams depuis l'équipe projet PROJECTOR. */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const guard = await requireProjectManager(id);
  if (!guard.ok) return guard.response;
  const { actor, it, project } = guard.value;
  if (!project.teams) return jsonError(it("errors.noWorkspace"), 404);
  const check = await checkFeature("workspaces", await getIntegrationSettings());
  if (!check.ok) return jsonError(it("workspace.unavailable", { reason: check.message }), 503);
  try {
    const sync = await syncTeamMembers(project, project.teams.teamId);
    const updated = await setProjectTeamsWorkspace(project.id, { ...project.teams, lastMemberSync: sync }, actor);
    return NextResponse.json({
      sync,
      workspace: updated?.teams ?? null,
      message: it("workspace.synced", {
        added: sync.added.length,
        already: sync.alreadyMembers.length,
        skipped: sync.skipped.length,
      }),
    });
  } catch (error) {
    return graphFailure(error);
  }
}
