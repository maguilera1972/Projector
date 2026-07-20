import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserActAsChefDeProjet } from "@/lib/hermes/project-roles";
import {
  getPortfolioById,
  getProjectById,
  getQualityGateContextForProject,
  submitPhaseValidation,
} from "@/lib/db/store";
import type { SubmitPhaseGateInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
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
    const body = (await request.json()) as SubmitPhaseGateInput;
    const validation = await submitPhaseValidation(
      id,
      user.id,
      user.name,
      body,
    );
    const context = await getQualityGateContextForProject(id);

    return NextResponse.json({ validation, context }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Soumission impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
