import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getRequestTranslator } from "@/lib/i18n/server";
import { sendMail } from "@/lib/mail/graph";
import { buildTestEmail } from "@/lib/mail/templates";

export async function POST() {
  const { locale, t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.ADMIN_ACCESS)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const { subject, html } = buildTestEmail(locale);
  const result = await sendMail({ to: user.email, subject, html });
  if (!result.ok) {
    return NextResponse.json(
      { error: t("admin.mailTestFailed", { error: result.error }) },
      { status: result.reason === "not_configured" ? 400 : 502 },
    );
  }
  return NextResponse.json({ message: t("admin.mailTestSent", { email: user.email }) });
}
