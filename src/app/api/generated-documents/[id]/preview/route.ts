import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getGeneratedDocumentById,
  getProjectById,
  getPortfolioById,
  getTasksByProject,
  getPhaseValidationById,
} from "@/lib/db/store";
import { isWordTemplateAvailable } from "@/lib/documents/hermes-templates";
import { resolveWordTemplateFile } from "@/lib/documents/templates";
import {
  convertDocxToHtml,
  readGeneratedDocx,
  renderDocumentPreviewHtml,
  type DocumentPreviewDraft,
} from "@/lib/documents/word";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadPreviewContext(id: string, user: { name: string }) {
  const document = await getGeneratedDocumentById(id);
  if (!document) {
    return { error: NextResponse.json({ error: "Document introuvable." }, { status: 404 }) };
  }

  const project = await getProjectById(document.projectId);
  if (!project) {
    return { error: NextResponse.json({ error: "Projet introuvable." }, { status: 404 }) };
  }

  const validation = await getPhaseValidationById(document.validationId);
  if (!validation) {
    return {
      error: NextResponse.json(
        { error: "Validation de phase introuvable." },
        { status: 404 },
      ),
    };
  }

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;
  const tasks = await getTasksByProject(project.id);

  return {
    document,
    project: { ...project, portfolioName: portfolio?.name },
    validation,
    tasks,
    actorName: user.name,
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.DOCUMENTS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const ctx = await loadPreviewContext(id, user);
  if ("error" in ctx) return ctx.error;

  const draft = (await request.json()) as DocumentPreviewDraft;

  try {
    if (ctx.document.docxSource === "uploaded") {
      const docx = await readGeneratedDocx(
        ctx.document.projectId,
        ctx.document.id,
      );
      if (!docx) {
        return NextResponse.json(
          { error: "Fichier Word importé introuvable." },
          { status: 404 },
        );
      }
      const html = await convertDocxToHtml(docx);
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const html = await renderDocumentPreviewHtml(
      ctx.document,
      ctx.project,
      ctx.validation,
      ctx.tasks,
      ctx.actorName,
      draft,
    );
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aperçu Word impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  const ctx = await loadPreviewContext(id, user);
  if ("error" in ctx) return ctx.error;

  const { document, project, validation, tasks, actorName } = ctx;

  if (document.docxSource === "uploaded") {
    const docx = await readGeneratedDocx(document.projectId, document.id);
    if (!docx) {
      return NextResponse.json(
        { error: "Fichier Word importé introuvable." },
        { status: 404 },
      );
    }
    try {
      const html = await convertDocxToHtml(docx);
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Aperçu Word impossible.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const wordFile = resolveWordTemplateFile(document);
  if (!wordFile || !isWordTemplateAvailable(wordFile)) {
    return NextResponse.json(
      {
        error: wordFile
          ? `Gabarit Word introuvable : ${wordFile}. Exécutez npm run hermes:templates:install.`
          : "Gabarit Word introuvable pour ce document.",
      },
      { status: 503 },
    );
  }

  try {
    const html = await renderDocumentPreviewHtml(
      document,
      project,
      validation,
      tasks,
      actorName,
    );
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Aperçu Word impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
