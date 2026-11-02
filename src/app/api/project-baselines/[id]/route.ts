import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserManageProjectTasks } from "@/lib/auth/task-assignment";
import {
  deleteProjectBaseline,
  getPortfolioById,
  getProjectBaselineById,
  getProjectById,
  listProjectBaselines,
} from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const baseline = await getProjectBaselineById(id);

  if (!baseline) {
    return NextResponse.json({ error: "Baseline introuvable." }, { status: 404 });
  }

  const project = await getProjectById(baseline.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  if (!canUserManageProjectTasks(user, project, portfolio)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const deleted = await deleteProjectBaseline(id);
  if (!deleted) {
    return NextResponse.json({ error: "Baseline introuvable." }, { status: 404 });
  }

  const baselines = await listProjectBaselines(baseline.projectId);
  return NextResponse.json({ baselines });
}
