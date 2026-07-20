import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getPortfolioById,
  listUsers,
  setPortfolioSharedResources,
} from "@/lib/db/store";
import { toAssigneeOptions } from "@/lib/users";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const portfolio = await getPortfolioById(id);

  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio introuvable." }, { status: 404 });
  }

  const users = toAssigneeOptions(await listUsers());

  return NextResponse.json({
    sharedResourceIds: portfolio.sharedResourceIds ?? [],
    users,
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as { userIds: string[] };
    const portfolio = await setPortfolioSharedResources(id, body.userIds ?? []);
    return NextResponse.json({ portfolio });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
