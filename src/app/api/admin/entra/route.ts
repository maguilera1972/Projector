import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { getEntraSettings, updateEntraUnknownUserPolicy } from "@/lib/db/store";

export async function GET() {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }
  return NextResponse.json({ settings: await getEntraSettings() });
}

export async function PATCH(request: Request) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { unknownUserPolicy?: unknown };
  if (body.unknownUserPolicy !== "deny" && body.unknownUserPolicy !== "pending") {
    return NextResponse.json({ error: t("common.invalidRequest") }, { status: 400 });
  }

  const settings = await updateEntraUnknownUserPolicy(body.unknownUserPolicy, {
    id: user.id,
    name: user.name,
  });
  return NextResponse.json({ settings });
}
