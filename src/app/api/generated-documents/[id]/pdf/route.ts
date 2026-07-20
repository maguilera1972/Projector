import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getGeneratedDocumentById,
  getProjectById,
} from "@/lib/db/store";
import {
  buildPdfFilename,
  markdownToPdfBuffer,
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
  const document = await getGeneratedDocumentById(id);

  if (!document) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const project = await getProjectById(document.projectId);
  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const pdf = await markdownToPdfBuffer(
    document.title,
    document.contentMarkdown,
  );
  const filename = buildPdfFilename(document.title, document.version);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
