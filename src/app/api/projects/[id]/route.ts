import { NextResponse } from "next/server";
import {
  assignProjectToPortfolio,
  deleteProject,
  getPortfolioById,
  getProjectById,
  updateProjectMandant,
} from "@/lib/db/store";
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
  };

  try {
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
