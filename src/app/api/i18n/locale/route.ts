import { NextResponse } from "next/server";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { toSessionUser } from "@/lib/auth/permissions";
import { isLocale } from "@/lib/i18n/config";
import { setLocaleCookie } from "@/lib/i18n/server";
import { updateUserLocale } from "@/lib/db/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { locale?: unknown };
  if (!isLocale(body.locale)) {
    return NextResponse.json({ error: "Langue invalide." }, { status: 400 });
  }

  await setLocaleCookie(body.locale);

  const session = await getSessionUser();
  if (session) {
    const updated = await updateUserLocale(session.id, body.locale);
    if (updated) await createSession(toSessionUser(updated));
  }

  return NextResponse.json({ locale: body.locale });
}
