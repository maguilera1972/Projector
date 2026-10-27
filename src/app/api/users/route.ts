import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  defaultPermissionsForRole,
  hasPermission,
  isUserRole,
  PERMISSIONS,
  type UserRole,
} from "@/lib/auth/permissions";
import { isLocale } from "@/lib/i18n/config";
import { createUser, listUsers } from "@/lib/db/store";
import { toAssigneeOptions } from "@/lib/users";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TASKS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json({ users: toAssigneeOptions(users) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      locale?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim();
    const password = body.password ?? "";
    const role = body.role ?? "user";

    if (!name) {
      return NextResponse.json(
        { error: "Le nom est requis." },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "L'e-mail est requis." },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "L'e-mail n'est pas valide." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 },
      );
    }

    if (!isUserRole(role)) {
      return NextResponse.json(
        { error: "Rôle invalide." },
        { status: 400 },
      );
    }

    const created = await createUser({
      name,
      email,
      password,
      role,
      permissions: defaultPermissionsForRole(role),
      locale: isLocale(body.locale) ? body.locale : undefined,
    });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur lors de la création.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
