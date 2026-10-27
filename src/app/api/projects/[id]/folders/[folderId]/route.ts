import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { tDynamic } from "@/lib/i18n/translate";
import { deleteCustomFolder, renameCustomFolder } from "@/lib/db/store";
import { getProjectDocumentAccess } from "@/lib/documents/annex-access";

interface RouteParams {
  params: Promise<{ id: string; folderId: string }>;
}

async function authorize(projectId: string) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) {
    return { t, error: NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 }) };
  }
  const access = await getProjectDocumentAccess(projectId, user);
  if (!access) {
    return { t, error: NextResponse.json({ error: t("annexes.errorProject") }, { status: 404 }) };
  }
  if (!access.canWrite) {
    return { t, error: NextResponse.json({ error: t("common.accessDenied") }, { status: 403 }) };
  }
  return { t, user };
}

function folderError(error: unknown, t: Awaited<ReturnType<typeof authorize>>["t"]) {
  const code = error instanceof Error ? error.message : "";
  return NextResponse.json(
    { error: code.startsWith("folder") ? tDynamic(t, `annexes.${code}`) : t("common.unknownError") },
    { status: 400 },
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id, folderId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: auth.t("common.invalidRequest") }, { status: 400 });
  }
  try {
    const folder = await renameCustomFolder(id, folderId, body.name, {
      id: auth.user.id,
      name: auth.user.name,
    });
    return NextResponse.json({ folder });
  } catch (error) {
    return folderError(error, auth.t);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id, folderId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  try {
    const deleted = await deleteCustomFolder(id, folderId, {
      id: auth.user.id,
      name: auth.user.name,
    });
    return NextResponse.json({ deleted });
  } catch (error) {
    return folderError(error, auth.t);
  }
}
