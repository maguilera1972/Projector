import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import {
  getAnnexDocumentById,
  softDeleteAnnexDocument,
  updateAnnexDocument,
} from "@/lib/db/store";
import {
  canEditAnnex,
  getProjectDocumentAccess,
  parseAnnexCategory,
  parseAnnexPhases,
} from "@/lib/documents/annex-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadContext(id: string) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 }) };
  }
  const document = await getAnnexDocumentById(id);
  if (!document) {
    return { error: NextResponse.json({ error: t("annexes.errorNotFound") }, { status: 404 }) };
  }
  const access = await getProjectDocumentAccess(document.projectId, user);
  if (!access || !canEditAnnex(access, document, user)) {
    return { error: NextResponse.json({ error: t("common.accessDenied") }, { status: 403 }) };
  }
  return { t, user, document };
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const context = await loadContext(id);
  if ("error" in context) return context.error;
  const { t, user } = context;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const document = await updateAnnexDocument(
      id,
      {
        title: typeof body.title === "string" ? body.title : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        category: parseAnnexCategory(body.category),
        phases: body.phases === undefined ? undefined : parseAnnexPhases(body.phases) ?? [],
        folderId: typeof body.folderId === "string" ? body.folderId : undefined,
      },
      { id: user.id, name: user.name },
    );
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t("common.unknownError") },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const context = await loadContext(id);
  if ("error" in context) return context.error;
  const removed = await softDeleteAnnexDocument(id, {
    id: context.user.id,
    name: context.user.name,
  });
  return NextResponse.json({ deleted: removed });
}
