import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { CreateProjectInput, HermesApproach } from "@/types";
import { isLocale } from "@/lib/i18n/config";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PROJECTS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PROJECTS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Partial<CreateProjectInput>;

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Le nom du projet est requis." },
        { status: 400 },
      );
    }

    if (!body.mandant?.trim() && !body.mandantUserId?.trim()) {
      return NextResponse.json(
        { error: "Le mandant (utilisateur) est requis." },
        { status: 400 },
      );
    }

    if (!body.chefDeProjetId?.trim()) {
      return NextResponse.json(
        { error: "Le chef de projet est requis." },
        { status: 400 },
      );
    }

    if (!body.startDate) {
      return NextResponse.json(
        { error: "La date de début est requise." },
        { status: 400 },
      );
    }

    if (!body.scenarioId?.trim()) {
      return NextResponse.json(
        { error: "Le scénario HERMES est requis." },
        { status: 400 },
      );
    }

    const approach: HermesApproach =
      body.approach === "agile" ? "agile" : "classic";

    try {
      const project = await createProject(
        {
          name: body.name,
          description: body.description ?? "",
          scenarioId: body.scenarioId.trim(),
          approach,
          portfolioId: body.portfolioId,
          mandant: body.mandant ?? "",
          chefDeProjetId: body.chefDeProjetId.trim(),
          startDate: body.startDate,
          endDate: body.endDate,
          budget:
            typeof body.budget === "number" && body.budget > 0
              ? body.budget
              : undefined,
          budgetHours:
            typeof body.budgetHours === "number" && body.budgetHours > 0
              ? body.budgetHours
              : undefined,
          mandantUserId: body.mandantUserId,
          documentLocale: isLocale(body.documentLocale) ? body.documentLocale : undefined,
        },
        user.id,
      );

      return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur lors de la création.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la création du projet." },
      { status: 500 },
    );
  }
}
