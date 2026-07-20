import { NextResponse } from "next/server";
import { createPortfolio, listPortfolios } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { CreatePortfolioInput } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_READ)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const portfolios = await listPortfolios();
  return NextResponse.json({ portfolios });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!hasPermission(user, PERMISSIONS.PORTFOLIOS_WRITE)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Partial<CreatePortfolioInput>;

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Le nom du portfolio est requis." },
        { status: 400 },
      );
    }

    if (!body.ownerId?.trim()) {
      return NextResponse.json(
        { error: "Le responsable du portfolio est requis." },
        { status: 400 },
      );
    }

    const portfolio = await createPortfolio(
      {
        name: body.name,
        description: body.description ?? "",
        ownerId: body.ownerId.trim(),
      },
      user.id,
    );

    return NextResponse.json({ portfolio }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la création du portfolio." },
      { status: 500 },
    );
  }
}
