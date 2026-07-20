import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  buildDocxFilename,
  buildDocxPayload,
  generateHermesDocxBuffer,
  readGeneratedDocx,
  shouldAutoRegenerateDocx,
  writeGeneratedDocx,
} from "@/lib/documents/word";
import { resolveWordTemplateFile } from "@/lib/documents/templates";
import { isWordTemplateAvailable } from "@/lib/documents/hermes-templates";
import {
  getGeneratedDocumentById,
  getProjectById,
  getPortfolioById,
  getTasksByProject,
  getPhaseValidationById,
  replaceGeneratedDocumentDocx,
} from "@/lib/db/store";
import { canUserEditProjectDocuments } from "@/lib/hermes/project-roles";

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

  const validation = await getPhaseValidationById(document.validationId);
  if (!validation) {
    return NextResponse.json(
      { error: "Validation de phase introuvable." },
      { status: 404 },
    );
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;
  const tasks = await getTasksByProject(project.id);

  let docx: Buffer | null = null;

  if (
    resolveWordTemplateFile(document) &&
    shouldAutoRegenerateDocx(document)
  ) {
    const wordFile = resolveWordTemplateFile(document)!;
    if (isWordTemplateAvailable(wordFile)) {
      try {
        const payload = buildDocxPayload(
          wordFile,
          { ...project, portfolioName: portfolio?.name },
          document.phase,
          validation,
          tasks,
          document.locale,
          document.version,
          user.name,
          document.milestone,
          document.contentMarkdown,
        );
        docx = await generateHermesDocxBuffer(payload);
        await writeGeneratedDocx(document.projectId, document.id, docx).catch(
          (error) => {
            console.warn("writeGeneratedDocx:", error);
          },
        );
      } catch (error) {
        console.error("generateHermesDocxBuffer:", error);
      }
    }
  }

  if (!docx) {
    docx = await readGeneratedDocx(document.projectId, document.id);
  }
  if (!docx) {
    return NextResponse.json(
      { error: "Fichier Word non disponible pour ce document." },
      { status: 404 },
    );
  }

  const filename = buildDocxFilename(document.title, document.version);

  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
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
      { error: "Seul le chef de projet peut remplacer ce document." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Aucun fichier Word fourni." },
      { status: 400 },
    );
  }

  const fileName = file.name.trim();
  if (!fileName.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "Le fichier doit être au format .docx." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const updated = await replaceGeneratedDocumentDocx(
      id,
      user.id,
      user.name,
      buffer,
      fileName,
    );
    return NextResponse.json({ document: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Remplacement impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
