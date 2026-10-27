import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { getAnnexDocumentById, getAnnexUploadsRoot } from "@/lib/db/store";
import { getProjectDocumentAccess } from "@/lib/documents/annex-access";
import { contentDisposition, readAnnexFile } from "@/lib/documents/annex-storage";

/** Téléchargement authentifié d'une version (dernière par défaut, ?version=N sinon). */
export async function GET(
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
  if (!access?.canRead) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const requested = Number(new URL(request.url).searchParams.get("version"));
  const version = Number.isInteger(requested) && requested > 0
    ? document.versions.find((item) => item.version === requested)
    : document.versions.reduce((latest, item) => (item.version > latest.version ? item : latest));
  if (!version) return NextResponse.json({ error: t("annexes.errorNotFound") }, { status: 404 });

  try {
    const data = await readAnnexFile(
      getAnnexUploadsRoot(),
      document.projectId,
      document.id,
      version.storedName,
    );
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": version.mimeType || "application/octet-stream",
        "Content-Length": String(data.length),
        "Content-Disposition": contentDisposition(version.originalName),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: t("annexes.errorFileMissing") }, { status: 404 });
  }
}
