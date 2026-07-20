import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getGeneratedDocumentById,
  getPortfolioById,
  getProjectById,
  updateGeneratedDocument,
} from "@/lib/db/store";
import { canUserEditProjectDocuments } from "@/lib/hermes/project-roles";
import type { UpdateGeneratedDocumentInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const document = await getGeneratedDocumentById(id);

  if (!document) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const project = await getProjectById(document.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  return NextResponse.json({ document, projectName: project.name });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const document = await getGeneratedDocumentById(id);

  if (!document) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const project = await getProjectById(document.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  if (!canUserEditProjectDocuments(user, project, portfolio)) {
    return NextResponse.json(
      { error: "Seul le chef de projet peut modifier ce document." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as UpdateGeneratedDocumentInput;
    const updated = await updateGeneratedDocument(
      id,
      user.id,
      user.name,
      body,
    );

    return NextResponse.json({ document: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
