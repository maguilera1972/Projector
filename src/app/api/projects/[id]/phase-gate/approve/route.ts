import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserActAsMandant } from "@/lib/hermes/project-roles";
import {
  approvePhaseValidation,
  getProjectById,
  getQualityGateContextForProject,
  listPhaseValidationsByProject,
} from "@/lib/db/store";
import type { ApprovePhaseGateInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  if (!canUserActAsMandant(user, project)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const validations = await listPhaseValidationsByProject(id);
  const active = validations.find((item) => item.status === "submitted");

  if (!active) {
    return NextResponse.json(
      { error: "Aucune demande en attente." },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json()) as ApprovePhaseGateInput;
    const result = await approvePhaseValidation(
      active.id,
      user.id,
      user.name,
      body,
    );
    const context = await getQualityGateContextForProject(id);

    return NextResponse.json({ ...result, context });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Validation impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
