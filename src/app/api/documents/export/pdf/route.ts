import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { listAllGeneratedDocuments } from "@/lib/db/store";
import {
  buildAllDocumentsPdfFilename,
  documentsToPdfBuffer,
} from "@/lib/documents/pdf";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const documents = await listAllGeneratedDocuments();

  if (documents.length === 0) {
    return NextResponse.json(
      { error: "Aucun document à exporter." },
      { status: 404 },
    );
  }

  const sections: { title: string; contentMarkdown: string }[] = [];
  let currentProject = "";

  for (const doc of documents) {
    if (doc.projectName !== currentProject) {
      currentProject = doc.projectName;
      sections.push({
        title: `Projet : ${doc.projectName}`,
        contentMarkdown: `_Regroupement des livrables HERMES du projet **${doc.projectName}**._`,
      });
    }
    sections.push({
      title: doc.title,
      contentMarkdown: doc.contentMarkdown,
    });
  }

  const projectCount = new Set(documents.map((doc) => doc.projectId)).size;

  const pdf = await documentsToPdfBuffer(sections, {
    coverTitle: "Export documentaire PROJECTOR",
    coverSubtitle: `${projectCount} projet${projectCount !== 1 ? "s" : ""} · ${documents.length} document${documents.length !== 1 ? "s" : ""}`,
  });

  const filename = buildAllDocumentsPdfFilename();

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
