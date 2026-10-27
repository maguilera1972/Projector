import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { tDynamic } from "@/lib/i18n/translate";
import { createCustomFolder, listProjectFolders } from "@/lib/db/store";
import { getProjectDocumentAccess } from "@/lib/documents/annex-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  const { id } = await params;
  const access = await getProjectDocumentAccess(id, user);
  if (!access) return NextResponse.json({ error: t("annexes.errorProject") }, { status: 404 });
  if (!access.canRead) return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  return NextResponse.json({ folders: await listProjectFolders(id) });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  const { id } = await params;
  const access = await getProjectDocumentAccess(id, user);
  if (!access) return NextResponse.json({ error: t("annexes.errorProject") }, { status: 404 });
  if (!access.canWrite) return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { parentId?: unknown; name?: unknown };
  if (typeof body.parentId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ error: t("common.invalidRequest") }, { status: 400 });
  }

  try {
    const folder = await createCustomFolder(id, body.parentId, body.name, {
      id: user.id,
      name: user.name,
    });
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: code.startsWith("folder") ? tDynamic(t, `annexes.${code}`) : t("common.unknownError") },
      { status: 400 },
    );
  }
}
