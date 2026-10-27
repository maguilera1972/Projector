import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";
import { deleteEntraRoleMapping } from "@/lib/db/store";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const { id } = await context.params;
  const removed = await deleteEntraRoleMapping(id, { id: user.id, name: user.name });
  if (!removed) return NextResponse.json({ error: t("common.invalidRequest") }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
