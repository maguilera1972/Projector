import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { addAnnexDocumentVersion, getAnnexDocumentById } from "@/lib/db/store";
import { getProjectDocumentAccess } from "@/lib/documents/annex-access";
import { readUploadedFile } from "@/lib/documents/annex-upload";

/** Dépose une nouvelle version d'un document annexe (l'historique est conservé). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });

  const { id } = await params;
  const document = await getAnnexDocumentById(id);
  if (!document) return NextResponse.json({ error: t("annexes.errorNotFound") }, { status: 404 });

  const access = await getProjectDocumentAccess(document.projectId, user);
  if (!access?.canWrite) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: t("common.invalidRequest") }, { status: 400 });
  }

  const upload = await readUploadedFile(form, t);
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const comment = form.get("comment");
  try {
    const updated = await addAnnexDocumentVersion(
      id,
      upload.file,
      typeof comment === "string" ? comment : undefined,
      { id: user.id, name: user.name },
    );
    return NextResponse.json({ document: updated }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : t("common.unknownError") },
      { status: 400 },
    );
  }
}
