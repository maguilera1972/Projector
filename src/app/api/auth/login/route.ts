import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/db/store";
import { toSessionUser } from "@/lib/auth/permissions";
import { createSession } from "@/lib/auth/session";
import { getRequestTranslator } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const { t } = await getRequestTranslator();
  try {
    const { email, password } = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: t("auth.required") }, { status: 400 });
    }

    const user = await authenticateUser(email.trim(), password);

    if (!user) {
      return NextResponse.json({ error: t("auth.invalidCredentials") }, { status: 401 });
    }

    await createSession(toSessionUser(user));

    return NextResponse.json({ user: toSessionUser(user) });
  } catch {
    return NextResponse.json({ error: t("auth.loginError") }, { status: 500 });
  }
}
