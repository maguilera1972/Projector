import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserAssignTasksOnProject } from "@/lib/auth/task-assignment";
import {
  createProjectBaseline,
  getPortfolioById,
  getProjectById,
  listProjectBaselines,
} from "@/lib/db/store";
import type { CreateProjectBaselineInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const baselines = await listProjectBaselines(id);
  return NextResponse.json({ baselines });
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  if (!canUserAssignTasksOnProject(user, project, portfolio)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CreateProjectBaselineInput;
    const baseline = await createProjectBaseline(id, body, user.id);
    const baselines = await listProjectBaselines(id);

    return NextResponse.json({ baseline, baselines }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Création impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
