import { NextResponse } from "next/server";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { toSessionUser, type AvatarDisplay } from "@/lib/auth/permissions";
import { getUserById, updateUserProfile } from "@/lib/db/store";
import { isLocale } from "@/lib/i18n/config";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const user = await getUserById(session.id);
  if (!user) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      avatarDisplay?: AvatarDisplay;
      currentPassword?: string;
      newPassword?: string;
      locale?: string;
      emailNotifications?: boolean;
      teamsNotifications?: boolean;
    };

    if (body.locale !== undefined && !isLocale(body.locale)) {
      return NextResponse.json({ error: "Langue invalide." }, { status: 400 });
    }

    if (
      body.avatarDisplay !== undefined &&
      body.avatarDisplay !== "initials" &&
      body.avatarDisplay !== "gravatar"
    ) {
      return NextResponse.json(
        { error: "Mode d'avatar invalide." },
        { status: 400 },
      );
    }

    const updated = await updateUserProfile(session.id, {
      name: body.name,
      email: body.email,
      avatarDisplay: body.avatarDisplay,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      locale: isLocale(body.locale) ? body.locale : undefined,
      emailNotifications:
        typeof body.emailNotifications === "boolean"
          ? body.emailNotifications
          : undefined,
      teamsNotifications:
        typeof body.teamsNotifications === "boolean"
          ? body.teamsNotifications
          : undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Utilisateur introuvable." },
        { status: 404 },
      );
    }

    await createSession(toSessionUser(updated));

    return NextResponse.json({ user: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
