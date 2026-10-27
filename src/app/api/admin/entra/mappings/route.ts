import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isUserRole } from "@/lib/auth/permissions";
import { getRequestTranslator } from "@/lib/i18n/server";
import { addEntraRoleMapping } from "@/lib/db/store";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: unknown;
    value?: unknown;
    role?: unknown;
    label?: unknown;
  };

  const type = body.type === "group" ? "group" : body.type === "appRole" ? "appRole" : null;
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!type || !value || value.length > 200 || !isUserRole(body.role)) {
    return NextResponse.json({ error: t("common.invalidRequest") }, { status: 400 });
  }
  if (type === "group" && !GUID_PATTERN.test(value)) {
    return NextResponse.json({ error: t("entra.groupIdInvalid") }, { status: 400 });
  }

  try {
    const mapping = await addEntraRoleMapping(
      {
        type,
        value,
        role: body.role,
        label: typeof body.label === "string" ? body.label.slice(0, 120) : undefined,
      },
      { id: user.id, name: user.name },
    );
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error) {
    const duplicate = error instanceof Error && error.message === "duplicate";
    return NextResponse.json(
      { error: duplicate ? t("entra.mappingDuplicate") : t("common.unknownError") },
      { status: 400 },
    );
  }
}
