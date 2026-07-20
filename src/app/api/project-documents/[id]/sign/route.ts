import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserActAsChefDeProjet, isPlatformAdmin } from "@/lib/hermes/project-roles";
import {
  getPortfolioById,
  getProjectById,
  getProjectDocumentById,
  listProjectDocumentsByProject,
  signProjectDocument,
} from "@/lib/db/store";
import type { SignProjectDocumentInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const document = await getProjectDocumentById(id);

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

  const canSign =
    isPlatformAdmin(user) ||
    document.assignedToUserId === user.id ||
    canUserActAsChefDeProjet(user, project, portfolio);

  if (!canSign) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as SignProjectDocumentInput;
    const signed = await signProjectDocument(id, user.id, user.name, body);
    const documents = await listProjectDocumentsByProject(document.projectId);

    return NextResponse.json({ document: signed, documents });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Signature impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
