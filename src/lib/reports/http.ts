import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { canViewReports } from "./access";
import { getReportTranslator, type ReportTranslator } from "./i18n";

export type ReportErrorCode =
  | "notAuthenticated"
  | "forbidden"
  | "notFound"
  | "invalid"
  | "projectRequired"
  | "mailNotConfigured";

export function reportError(
  t: ReportTranslator,
  status: number,
  code: ReportErrorCode,
): NextResponse {
  return NextResponse.json({ error: t(`errors.${code}`), code }, { status });
}

/** Authentifie la requête et vérifie la permission « Rapports ». */
export async function authorizeReportRequest(): Promise<
  | { ok: true; user: SessionUser; uiLocale: Locale; t: ReportTranslator }
  | { ok: false; response: NextResponse }
> {
  const uiLocale = await getRequestLocale();
  const t = getReportTranslator(uiLocale);
  const user = await getSessionUser();
  if (!user) return { ok: false, response: reportError(t, 401, "notAuthenticated") };
  if (!canViewReports(user)) return { ok: false, response: reportError(t, 403, "forbidden") };
  return { ok: true, user, uiLocale, t };
}
