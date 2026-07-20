import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  listResourceProfiles,
  upsertResourceProfile,
} from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const profiles = await listResourceProfiles();
  const profile = profiles.find((item) => item.userId === id) ?? null;

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as {
      weeklyCapacityPercent: number;
      notes?: string;
    };

    const profile = await upsertResourceProfile(id, body);
    return NextResponse.json({ profile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
