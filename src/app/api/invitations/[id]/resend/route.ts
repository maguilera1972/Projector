import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getRequestTranslator } from "@/lib/i18n/server";
import { renewInvitationToken } from "@/lib/db/store";
import { deliverInvitation, invitationErrorMessage } from "@/lib/invitations/service";

/** Génère un nouveau lien (prolonge la validité) et renvoie l'e-mail. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const { invitation, token } = await renewInvitationToken(id);
    return NextResponse.json(await deliverInvitation(invitation, token));
  } catch (error) {
    return NextResponse.json({ error: invitationErrorMessage(error, t) }, { status: 400 });
  }
}
