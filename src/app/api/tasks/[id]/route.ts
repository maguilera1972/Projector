import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getTaskDetailContext } from "@/lib/tasks/access";
import {
  deleteManualTask,
  duplicateTask,
  getActivitiesByTaskId,
  getTaskById,
  startTask,
  updateTaskAssignee,
  updateTaskDefinition,
  updateTaskFields,
} from "@/lib/db/store";
import { taskErrorResponse, taskExceptionResponse } from "@/lib/tasks/http";
import type { HermesPhaseId, Task, UpdateTaskDefinitionInput, UpdateTaskInput } from "@/types";

const DEFINITION_KEYS = ["title", "description", "phase", "module"] as const;

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
      title?: string;
      description?: string | null;
      phase?: HermesPhaseId;
      module?: string | null;
    };

    let definitionTask: Task | undefined;
    if (DEFINITION_KEYS.some((key) => key in body)) {
      if (!context.permissions.canEditDefinition) return taskErrorResponse("forbidden");
      const definition: UpdateTaskDefinitionInput = {};
      if (typeof body.title === "string") definition.title = body.title;
      if ("description" in body) definition.description = body.description ?? null;
      if (typeof body.phase === "string") definition.phase = body.phase;
      if ("module" in body) definition.module = body.module ?? null;
      definitionTask = await updateTaskDefinition(id, definition, { id: user.id, name: user.name });
    }

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

    if (!hasTaskFieldUpdate && definitionTask) {
      const activities = await getActivitiesByTaskId(id);
      return NextResponse.json({ task: definitionTask, activities });
    }

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
        ...("startDate" in body ? { startDate: body.startDate } : {}),
        ...("dueDate" in body ? { dueDate: body.dueDate } : {}),
        ...("durationDays" in body ? { durationDays: body.durationDays } : {}),
      },
      user.id,
    );

    const activities = await getActivitiesByTaskId(id);
    return NextResponse.json({ task: updated, activities });
  } catch (error) {
    return taskExceptionResponse(error, "Mise à jour impossible.");
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
    const body = (await request.json()) as { action?: string; title?: string };

    if (body.action === "duplicate") {
      if (!context.permissions.canDuplicateTask) return taskErrorResponse("forbidden");
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title
          : `${context.task.title} (copie)`;
      const task = await duplicateTask(id, title, { id: user.id, name: user.name });
      return NextResponse.json({ task }, { status: 201 });
    }

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
    return taskExceptionResponse(error, "Action impossible.");
  }
}

/** Supprime (archive) une tâche manuelle ; `?confirm=1` requis si du temps a été saisi. */
export async function DELETE(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return taskErrorResponse("unauthenticated");

  const { id } = await params;
  const context = await getTaskDetailContext(id, user);
  if (!context) return taskErrorResponse("taskNotFound");
  if (!context.permissions.canManage) return taskErrorResponse("forbidden");

  try {
    const confirm = new URL(request.url).searchParams.get("confirm") === "1";
    const result = await deleteManualTask(id, { id: user.id, name: user.name }, { confirmTimeEntries: confirm });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return taskExceptionResponse(error, "Suppression impossible.");
  }
}
