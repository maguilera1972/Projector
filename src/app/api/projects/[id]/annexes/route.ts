import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { createAnnexDocument, listAnnexDocumentsByProject } from "@/lib/db/store";
import {
  getProjectDocumentAccess,
  parseAnnexCategory,
  parseAnnexPhases,
} from "@/lib/documents/annex-access";
import { readUploadedFile } from "@/lib/documents/annex-upload";

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
  return NextResponse.json({ documents: await listAnnexDocumentsByProject(id) });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  const { id } = await params;
  const access = await getProjectDocumentAccess(id, user);
  if (!access) return NextResponse.json({ error: t("annexes.errorProject") }, { status: 404 });
  if (!access.canWrite) return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: t("common.invalidRequest") }, { status: 400 });
  }

  const upload = await readUploadedFile(form, t);
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const text = (key: string, max: number) => {
    const value = form.get(key);
    return typeof value === "string" ? value.slice(0, max) : undefined;
  };

  try {
    const document = await createAnnexDocument(
      id,
      {
        title: text("title", 200),
        description: text("description", 2000),
        category: parseAnnexCategory(form.get("category")),
        phases: parseAnnexPhases(form.get("phases")),
        folderId: text("folderId", 120) || undefined,
      },
      upload.file,
      { id: user.id, name: user.name },
    );
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t("common.unknownError") },
      { status: 400 },
    );
  }
}
