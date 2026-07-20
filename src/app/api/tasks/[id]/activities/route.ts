import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getTaskDetailContext } from "@/lib/tasks/access";
import { createActivity, getActivitiesByTaskId, getTaskById } from "@/lib/db/store";
import type { CreateActivityInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  if (!context.permissions.canAddActivities) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CreateActivityInput;
    const activity = await createActivity(id, body, user.id);
    const activities = await getActivitiesByTaskId(id);
    const task = await getTaskById(id);

    return NextResponse.json(
      { activity, activities, task },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Création impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
