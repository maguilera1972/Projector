import { NextResponse } from "next/server";
import {
  archivePortfolio,
  deletePortfolio,
  getPortfolioById,
  getPortfolioStats,
  listProjects,
  updatePortfolio,
} from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { CreatePortfolioInput } from "@/types";

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

  const stats = await getPortfolioStats(id);
  const projects = await listProjects(id);

  return NextResponse.json({ portfolio, stats, projects });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as Partial<CreatePortfolioInput> & {
    action?: "archive";
  };

  if (body.action === "archive") {
    if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_MANAGE)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const portfolio = await archivePortfolio(id);
    if (!portfolio) {
      return NextResponse.json({ error: "Portfolio introuvable." }, { status: 404 });
    }
    return NextResponse.json({ portfolio });
  }

  if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const portfolio = await updatePortfolio(id, body);
  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio introuvable." }, { status: 404 });
  }

  return NextResponse.json({ portfolio });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.ADMIN_ACCESS)) {
    return NextResponse.json(
      { error: "Suppression réservée à l'administration." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const portfolio = await getPortfolioById(id);

  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio introuvable." }, { status: 404 });
  }

  const result = await deletePortfolio(id);
  return NextResponse.json({
    success: true,
    deletedProjects: result?.deletedProjects ?? 0,
  });
}
