import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  canUserUpdateActivity,
  getTaskDetailContext,
} from "@/lib/tasks/access";
import {
  deleteActivity,
  getActivitiesByTaskId,
  getTaskById,
  startActivity,
  updateActivityFields,
} from "@/lib/db/store";
import type { UpdateActivityInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string; activityId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id, activityId } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  const activity = context.activities.find((item) => item.id === activityId);
  if (!activity) {
    return NextResponse.json({ error: "Activité introuvable." }, { status: 404 });
  }

  if (
    !canUserUpdateActivity(
      user,
      context.task,
      activity,
      context.permissions.canManage,
    )
  ) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as UpdateActivityInput;
    const isActivityAssignee = activity.assigneeId === user.id;
    const canEditMeta =
      context.permissions.canManage || context.task.assigneeId === user.id;

    if (
      (body.title !== undefined || "assigneeId" in body) &&
      !canEditMeta
    ) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (
      (body.progress !== undefined ||
        body.status !== undefined ||
        body.comments !== undefined ||
        "startDate" in body ||
        "dueDate" in body) &&
      !canEditMeta &&
      !isActivityAssignee
    ) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (
      ("startDate" in body || "dueDate" in body) &&
      !canEditMeta
    ) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const updated = await updateActivityFields(activityId, body, user.id);
    const task = await getTaskById(id);
    const activities = await getActivitiesByTaskId(id);

    return NextResponse.json({ activity: updated, activities, task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id, activityId } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  if (!context.permissions.canDeleteActivities) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const deleted = await deleteActivity(activityId);
  if (!deleted) {
    return NextResponse.json({ error: "Activité introuvable." }, { status: 404 });
  }

  const task = await getTaskById(id);
  const activities = await getActivitiesByTaskId(id);

  return NextResponse.json({ task, activities });
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id, activityId } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  const activity = context.activities.find((item) => item.id === activityId);
  if (!activity) {
    return NextResponse.json({ error: "Activité introuvable." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { action?: string };

    if (body.action !== "start") {
      return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
    }

    const isActivityAssignee = activity.assigneeId === user.id;
    const canStart =
      context.permissions.canManage ||
      context.task.assigneeId === user.id ||
      isActivityAssignee;

    if (!canStart) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (activity.startedAt) {
      return NextResponse.json(
        { error: "Cette activité est déjà démarrée." },
        { status: 400 },
      );
    }

    const updated = await startActivity(activityId);
    const task = await getTaskById(id);
    const activities = await getActivitiesByTaskId(id);

    return NextResponse.json({ activity: updated, activities, task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Démarrage impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
