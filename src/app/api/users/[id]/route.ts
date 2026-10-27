import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  ALL_PERMISSIONS,
  hasPermission,
  isUserRole,
  PERMISSIONS,
  type Permission,
  type UserRole,
  type UserStatus,
} from "@/lib/auth/permissions";
import {
  deleteUser,
  getUserByIdAny,
  updateUser,
} from "@/lib/db/store";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.USERS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await context.params;
  const target = await getUserByIdAny(id);

  if (!target) {
    return NextResponse.json(
      { error: "Utilisateur introuvable." },
      { status: 404 },
    );
  }

  return NextResponse.json({ user: target });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.USERS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      status?: UserStatus;
      permissions?: Permission[];
      roleOverride?: boolean;
    };

    if (
      (body.role !== undefined || body.roleOverride !== undefined) &&
      user.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Seul un administrateur peut modifier le rôle d'un utilisateur." },
        { status: 403 },
      );
    }

    if (id === user.id && user.role === "admin") {
      if (
        body.status === "suspended" ||
        (body.role !== undefined && body.role !== "admin")
      ) {
        return NextResponse.json(
          {
            error:
              "Vous ne pouvez pas vous retirer vos propres droits administrateur ou suspendre votre propre compte.",
          },
          { status: 400 },
        );
      }
    }

    if (body.role !== undefined && !isUserRole(body.role)) {
      return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
    }

    if (
      body.status !== undefined &&
      body.status !== "active" &&
      body.status !== "suspended"
    ) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    if (body.permissions !== undefined) {
      const invalid = body.permissions.some(
        (permission) => !ALL_PERMISSIONS.includes(permission),
      );
      if (invalid) {
        return NextResponse.json(
          { error: "Permission invalide." },
          { status: 400 },
        );
      }
    }

    const updated = await updateUser(id, {
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      status: body.status,
      permissions: body.permissions,
      roleOverride:
        typeof body.roleOverride === "boolean" ? body.roleOverride : undefined,
    }, { id: user.id, name: user.name });

    if (!updated) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 },
      );
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur lors de la mise à jour.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.USERS_DELETE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await context.params;

  if (id === user.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 },
    );
  }

  try {
    const deleted = await deleteUser(id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur lors de la suppression.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
