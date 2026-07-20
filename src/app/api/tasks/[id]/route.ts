import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getTaskDetailContext } from "@/lib/tasks/access";
import {
  getActivitiesByTaskId,
  getTaskById,
  startTask,
  updateTaskAssignee,
  updateTaskFields,
} from "@/lib/db/store";
import type { UpdateTaskInput } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  if (!context.permissions.canWork && !context.permissions.canManage) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  return NextResponse.json(context);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id } = await params;
  const context = await getTaskDetailContext(id, user);

  if (!context) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as UpdateTaskInput & {
      assigneeId?: string | null;
    };

    if ("assigneeId" in body) {
      if (!context.permissions.canManage) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const assigneeId: string | null =
        body.assigneeId === null ||
        body.assigneeId === "" ||
        body.assigneeId === undefined
          ? null
          : body.assigneeId;

      const updated = await updateTaskAssignee(id, assigneeId, user.id);
      return NextResponse.json({ task: updated });
    }

    const hasTaskFieldUpdate =
      body.status !== undefined ||
      body.progress !== undefined ||
      body.comments !== undefined ||
      "startDate" in body ||
      "dueDate" in body ||
      "durationDays" in body;

    if (!hasTaskFieldUpdate) {
      return NextResponse.json(
        { error: "Aucune donnée à mettre à jour." },
        { status: 400 },
      );
    }

    const isTaskAssignee = context.task.assigneeId === user.id;
    const canUpdateComments =
      context.permissions.canManage ||
      (context.permissions.canWork && isTaskAssignee);
    const canUpdateProgressStatus = context.permissions.canEditTaskFields;
    const canUpdateSchedule = context.permissions.canEditSchedule;

    if (
      (body.status !== undefined || body.progress !== undefined) &&
      !canUpdateProgressStatus
    ) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (body.comments !== undefined && !canUpdateComments) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (
      ("startDate" in body ||
        "dueDate" in body ||
        "durationDays" in body) &&
      !canUpdateSchedule
    ) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const updated = await updateTaskFields(
      id,
      {
        status: body.status,
        progress: body.progress,
        comments: body.comments,
        startDate: body.startDate,
        dueDate: body.dueDate,
        durationDays: body.durationDays,
      },
      user.id,
    );

    const activities = await getActivitiesByTaskId(id);
    return NextResponse.json({ task: updated, activities });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mise à jour impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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

  try {
    const body = (await request.json()) as { action?: string };

    if (body.action !== "start") {
      return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
    }

    if (!context.permissions.canStartTask) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const task = await startTask(id);
    const activities = await getActivitiesByTaskId(id);

    return NextResponse.json({ task, activities });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Démarrage impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
