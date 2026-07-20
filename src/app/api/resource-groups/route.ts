import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createResourceGroup,
  listResourceGroups,
} from "@/lib/db/store";
import type { CreateResourceGroupInput } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const groups = await listResourceGroups();
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.TEAM_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CreateResourceGroupInput;
    const group = await createResourceGroup(body);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Création impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
