import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  defaultPermissionsForRole,
  hasPermission,
  isUserRole,
  PERMISSIONS,
  sanitizePermissions,
} from "@/lib/auth/permissions";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";
import { createInvitation, listInvitations } from "@/lib/db/store";
import { deliverInvitation, invitationErrorMessage } from "@/lib/invitations/service";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }
  return NextResponse.json({ invitations: await listInvitations() });
}

export async function POST(request: Request) {
  const { t } = await getRequestTranslator();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: t("common.notAuthenticated") }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: unknown;
    permissions?: unknown;
    locale?: unknown;
    message?: string;
  };

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email) return NextResponse.json({ error: t("common.emailRequired") }, { status: 400 });
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: t("common.emailInvalid") }, { status: 400 });
  }

  const role = body.role ?? "guest";
  if (!isUserRole(role)) {
    return NextResponse.json({ error: t("invitations.invalidRole") }, { status: 400 });
  }
  // Seul un administrateur peut inviter un autre administrateur.
  if (role === "admin" && user.role !== "admin") {
    return NextResponse.json({ error: t("common.accessDenied") }, { status: 403 });
  }

  const permissions =
    body.permissions === undefined
      ? defaultPermissionsForRole(role)
      : sanitizePermissions(body.permissions);

  try {
    const { invitation, token } = await createInvitation({
      email,
      name: body.name?.slice(0, 200),
      role,
      permissions,
      locale: isLocale(body.locale) ? body.locale : DEFAULT_LOCALE,
      message: body.message?.slice(0, 2000),
      invitedBy: user.id,
      invitedByName: user.name,
    });

    const delivery = await deliverInvitation(invitation, token);
    return NextResponse.json(delivery, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: invitationErrorMessage(error, t) }, { status: 400 });
  }
}
