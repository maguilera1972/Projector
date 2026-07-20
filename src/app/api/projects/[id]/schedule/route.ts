import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getProjectScheduleSummary } from "@/lib/db/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const summary = await getProjectScheduleSummary(id);

  if (!summary) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  return NextResponse.json(summary);
}
