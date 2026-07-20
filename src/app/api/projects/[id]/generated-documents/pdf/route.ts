import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getProjectById,
  listGeneratedDocumentsByProject,
} from "@/lib/db/store";
import {
  buildProjectPdfFilename,
  documentsToPdfBuffer,
} from "@/lib/documents/pdf";

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
  const project = await getProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const documents = await listGeneratedDocumentsByProject(id);

  if (documents.length === 0) {
    return NextResponse.json(
      { error: "Aucun document à exporter pour ce projet." },
      { status: 404 },
    );
  }

  const pdf = await documentsToPdfBuffer(
    documents.map((doc) => ({
      title: doc.title,
      contentMarkdown: doc.contentMarkdown,
    })),
    {
      coverTitle: `Documents HERMES — ${project.name}`,
      coverSubtitle: `Projet · ${documents.length} document${documents.length !== 1 ? "s" : ""}`,
    },
  );

  const filename = buildProjectPdfFilename(project.name);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
