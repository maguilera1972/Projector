import { NextResponse, type NextRequest } from "next/server";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { LOCALES, normalizeLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";
import { escapeHtml } from "@/lib/mail/layout";
import { EMAIL_PREVIEW_TYPES, isEmailPreviewType, renderEmailPreview } from "@/lib/mail/previews";

const PREVIEW_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Aperçu des e-mails (administrateurs) : `?type=invitation&locale=de[&format=text]`.
 * Sans `type`, renvoie la liste des aperçus disponibles.
 */
export async function GET(request: NextRequest) {
  const { locale: requestLocale, t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ADMIN_ACCESS)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");
  const locale = normalizeLocale(searchParams.get("locale") ?? requestLocale);

  if (!type) {
    const links = EMAIL_PREVIEW_TYPES.map(
      (item) =>
        `<tr><td>${escapeHtml(item)}</td><td>${LOCALES.map(
          (code) =>
            `<a href="?type=${encodeURIComponent(item)}&amp;locale=${code}">${code}</a> (<a href="?type=${encodeURIComponent(item)}&amp;locale=${code}&amp;format=text">txt</a>)`,
        ).join(" · ")}</td></tr>`,
    ).join("");
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PROJECTOR — e-mails</title></head><body style="font-family:sans-serif;padding:24px"><h1>PROJECTOR — e-mails</h1><table cellpadding="6">${links}</table></body></html>`,
      { headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!isEmailPreviewType(type)) {
    return NextResponse.json({ error: `type: ${EMAIL_PREVIEW_TYPES.join(", ")}` }, { status: 400 });
  }

  const rendered = renderEmailPreview(type, locale);
  if (searchParams.get("format") === "text") {
    return new NextResponse(`Subject: ${rendered.subject}\n\n${rendered.text}`, {
      headers: { ...PREVIEW_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(rendered.html, {
    headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
