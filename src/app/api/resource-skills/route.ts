import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  listUserSkills,
  removeUserSkill,
  setUserSkill,
} from "@/lib/db/store";
import type { SkillLevel } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const skills = await listUserSkills();
  return NextResponse.json({ skills });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      userId: string;
      groupId: string;
      level: SkillLevel;
    };

    if (!body.userId || !body.groupId || !body.level) {
      return NextResponse.json(
        { error: "userId, groupId et level sont requis." },
        { status: 400 },
      );
    }

    const skill = await setUserSkill(body.userId, body.groupId, body.level);
    return NextResponse.json({ skill });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      userId: string;
      groupId: string;
    };

    if (!body.userId || !body.groupId) {
      return NextResponse.json(
        { error: "userId et groupId sont requis." },
        { status: 400 },
      );
    }

    await removeUserSkill(body.userId, body.groupId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Suppression impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
