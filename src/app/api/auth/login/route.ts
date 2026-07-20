import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/db/store";
import { toSessionUser } from "@/lib/auth/permissions";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const { email, password } = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password) {
      return NextResponse.json(
        { error: "E-mail et mot de passe requis." },
        { status: 400 },
      );
    }

    const user = await authenticateUser(email.trim(), password);

    if (!user) {
      return NextResponse.json(
        { error: "Identifiants invalides." },
        { status: 401 },
      );
    }

    await createSession(toSessionUser(user));

    return NextResponse.json({ user: toSessionUser(user) });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la connexion." },
      { status: 500 },
    );
  }
}
