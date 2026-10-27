import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getRequestTranslator } from "@/lib/i18n/server";
import { deleteInvitation, revokeInvitation } from "@/lib/db/store";
import { invitationErrorMessage } from "@/lib/invitations/service";

/** Révoque une invitation en attente (ou supprime l'entrée si ?purge=1). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const { id } = await context.params;
  const purge = new URL(request.url).searchParams.get("purge") === "1";

  try {
    if (purge) {
      const removed = await deleteInvitation(id);
      if (!removed) {
        return NextResponse.json({ error: t("invitations.notFound") }, { status: 404 });
      }
      return NextResponse.json({ deleted: true });
    }
    const invitation = await revokeInvitation(id);
    return NextResponse.json({ invitation });
  } catch (error) {
    return NextResponse.json({ error: invitationErrorMessage(error, t) }, { status: 400 });
  }
}
