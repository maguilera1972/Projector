import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserActAsChefDeProjet } from "@/lib/hermes/project-roles";
import {
  getPortfolioById,
  getProjectById,
  listBudgetRevisionsByProject,
  requestBudgetRevision,
} from "@/lib/db/store";
import type { RequestBudgetRevisionInput } from "@/types";

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

  const revisions = await listBudgetRevisionsByProject(id);
  return NextResponse.json({ revisions });
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

  if (!canUserActAsChefDeProjet(user, project, portfolio)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as RequestBudgetRevisionInput;
    const revision = await requestBudgetRevision(
      id,
      user.id,
      user.name,
      body,
    );
    const revisions = await listBudgetRevisionsByProject(id);

    return NextResponse.json({ revision, revisions }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Demande impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
