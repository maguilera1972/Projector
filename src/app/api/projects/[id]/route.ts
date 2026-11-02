import { NextResponse } from "next/server";
import {
  assignProjectToPortfolio,
  deleteProject,
  getPortfolioById,
  getProjectById,
  updateProjectLocale,
  updateProjectDates,
  updateProjectMandant,
} from "@/lib/db/store";
import { isValidIsoDate } from "@/lib/time-tracking/rules";
import { isLocale } from "@/lib/i18n/config";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  canUserManageProjectMandant,
  isPlatformAdmin,
} from "@/lib/hermes/project-roles";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
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

  const body = (await request.json()) as {
    portfolioId?: string | null;
    mandantUserId?: string | null;
    documentLocale?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  };

  try {
    if ("startDate" in body || "endDate" in body) {
      if (!canUserManageProjectMandant(user, project, portfolio)) {
        return NextResponse.json({ error: "Accès refusé.", code: "forbidden" }, { status: 403 });
      }
      const startDate = typeof body.startDate === "string" ? body.startDate : project.startDate;
      const endDate = typeof body.endDate === "string" ? body.endDate : project.endDate;
      if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
        return NextResponse.json(
          { error: "Dates de projet invalides.", code: "invalidDate" },
          { status: 400 },
        );
      }
      if (endDate < startDate) {
        return NextResponse.json(
          {
            error: "La date de fin doit être postérieure ou égale à la date de début.",
            code: "invalidPeriod",
          },
          { status: 400 },
        );
      }
      const updated = await updateProjectDates(
        id,
        { startDate, endDate },
        { id: user.id, name: user.name },
      );
      return NextResponse.json({ project: updated });
    }

    if ("mandantUserId" in body) {
      if (!canUserManageProjectMandant(user, project, portfolio)) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const mandantUserId =
        body.mandantUserId === null ||
        body.mandantUserId === undefined ||
        body.mandantUserId === ""
          ? null
          : body.mandantUserId;

      const updated = await updateProjectMandant(id, mandantUserId);
      return NextResponse.json({ project: updated });
    }

    if (!hasPermission(user, PERMISSIONS.PROJECTS_WRITE)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if ("documentLocale" in body) {
      if (!isLocale(body.documentLocale)) {
        return NextResponse.json({ error: "Langue invalide." }, { status: 400 });
      }
      const isChef = project.chefDeProjetId === user.id;
      if (!isChef && !isPlatformAdmin(user) && !canUserManageProjectMandant(user, project, portfolio)) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }
      const updated = await updateProjectLocale(id, body.documentLocale);
      return NextResponse.json({ project: updated });
    }

    if (!isPlatformAdmin(user) && !canUserManageProjectMandant(user, project, portfolio)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const portfolioId =
      body.portfolioId === null || body.portfolioId === ""
        ? null
        : body.portfolioId;

    const updated = await assignProjectToPortfolio(id, portfolioId ?? null);

    if (!updated) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }

    return NextResponse.json({ project: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const canDelete =
    hasPermission(user, PERMISSIONS.ADMIN_ACCESS) ||
    hasPermission(user, PERMISSIONS.PROJECTS_DELETE);

  if (!canDelete) {
    return NextResponse.json(
      { error: "Suppression réservée à l'administration." },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const deleted = await deleteProject(id);
    if (!deleted) {
      // Déjà absent : succès idempotent pour que l'UI puisse se synchroniser
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Suppression impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
