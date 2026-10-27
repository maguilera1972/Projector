import { NextResponse } from "next/server";
import { getIntegrationSettings, setProjectTeamsWorkspace } from "@/lib/db/store";
import { checkFeature } from "@/lib/integrations/capabilities";
import { graphFailure, jsonError, requireProjectManager } from "@/lib/integrations/http";
import { planSharePointSync } from "@/lib/teams/sharepoint";
import { provisionWorkspace, type ProvisionOptions } from "@/lib/teams/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const guard = await requireProjectManager(id, { allowMandant: true });
  if (!guard.ok) return guard.response;
  const { project } = guard.value;
  const settings = await getIntegrationSettings();
  const check = await checkFeature("workspaces", settings);
  return NextResponse.json({
    workspace: project.teams ?? null,
    available: check.ok,
    unavailableReason: check.ok ? undefined : check.message,
    sharePoint: await planSharePointSync(project, settings),
  });
}

/** Crée l'espace Teams (ou renvoie le plan si `dryRun`). */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const guard = await requireProjectManager(id);
  if (!guard.ok) return guard.response;
  const { actor, it, project } = guard.value;
  const body = (await request.json().catch(() => null)) as Partial<ProvisionOptions> | null;
  if (!body || (body.mode !== "team" && body.mode !== "channel")) {
    return jsonError(it("errors.invalidBody"), 400);
  }
  if (project.teams && !body.dryRun) return jsonError(it("errors.workspaceExists"), 409);

  const settings = await getIntegrationSettings();
  if (!body.dryRun) {
    const check = await checkFeature("workspaces", settings);
    if (!check.ok) return jsonError(it("workspace.unavailable", { reason: check.message }), 503);
  }

  try {
    const result = await provisionWorkspace(
      project,
      {
        mode: body.mode,
        teamId: body.teamId?.trim() || undefined,
        phaseChannels: body.phaseChannels === true,
        dryRun: body.dryRun === true,
      },
      actor,
      settings,
    );
    if (result.workspace) {
      await setProjectTeamsWorkspace(project.id, result.workspace, actor);
      return NextResponse.json({ ...result, message: it("workspace.created") });
    }
    return NextResponse.json(result);
  } catch (error) {
    return graphFailure(error);
  }
}

/** Délie l'espace Teams du projet (l'équipe et les canaux restent dans Teams). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const guard = await requireProjectManager(id);
  if (!guard.ok) return guard.response;
  const { actor, it, project } = guard.value;
  if (!project.teams) return jsonError(it("errors.noWorkspace"), 404);
  await setProjectTeamsWorkspace(project.id, null, actor);
  return NextResponse.json({ workspace: null });
}
