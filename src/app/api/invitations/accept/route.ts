import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/auth/permissions";
import { createSession } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";
import { acceptInvitation } from "@/lib/db/store";
import { invitationErrorMessage } from "@/lib/invitations/service";

/** Route publique : finalise une invitation et ouvre la session du nouvel utilisateur. */
export async function POST(request: Request) {
  const { t } = await getRequestTranslator();
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    name?: string;
    password?: string;
    locale?: unknown;
  };

  const token = body.token?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const password = body.password ?? "";

  if (!token) return NextResponse.json({ error: t("invitationAccept.invalid") }, { status: 400 });
  if (!name) return NextResponse.json({ error: t("common.nameRequired") }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: t("common.passwordMin") }, { status: 400 });
  }

  try {
    const user = await acceptInvitation(token, {
      name: name.slice(0, 200),
      password,
      locale: isLocale(body.locale) ? body.locale : undefined,
    });
    await createSession(toSessionUser(user));
    return NextResponse.json({ user: toSessionUser(user) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: invitationErrorMessage(error, t) }, { status: 400 });
  }
}
