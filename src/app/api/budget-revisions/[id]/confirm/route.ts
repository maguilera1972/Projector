import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  canUserActAsChefDeProjet,
} from "@/lib/hermes/project-roles";
import {
  confirmBudgetRevisionByChef,
  getBudgetRevisionById,
  getProjectById,
  getPortfolioById,
  getQualityGateContextForProject,
  listBudgetRevisionsByProject,
} from "@/lib/db/store";
import type { ConfirmBudgetInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const revision = await getBudgetRevisionById(id);

  if (!revision) {
    return NextResponse.json({ error: "Révision introuvable." }, { status: 404 });
  }

  const project = await getProjectById(revision.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  if (!canUserActAsChefDeProjet(user, project, portfolio)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as ConfirmBudgetInput;
    const result = await confirmBudgetRevisionByChef(
      id,
      user.id,
      user.name,
      body,
    );
    const context = await getQualityGateContextForProject(revision.projectId);
    const revisions = await listBudgetRevisionsByProject(revision.projectId);

    return NextResponse.json({ ...result, context, revisions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Validation impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
