import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canUserManageProjectTasks } from "@/lib/auth/task-assignment";
import { createManualTask, getPortfolioById, getProjectById } from "@/lib/db/store";
import { taskErrorResponse, taskExceptionResponse } from "@/lib/tasks/http";
import type { CreateManualTaskInput, HermesPhaseId, TaskStatus } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const STATUSES: TaskStatus[] = ["a_faire", "en_cours", "bloque"];

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Création manuelle d'une tâche (chef de projet, responsable du portfolio, administrateur). */
export async function POST(request: Request, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) return taskErrorResponse("unauthenticated");

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return taskErrorResponse("projectNotFound");
  const portfolio = project.portfolioId ? await getPortfolioById(project.portfolioId) : undefined;
  if (!canUserManageProjectTasks(user, project, portfolio)) return taskErrorResponse("forbidden");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return taskErrorResponse("invalidRequest");
  }

  const input: CreateManualTaskInput = {
    title: typeof body.title === "string" ? body.title : "",
    description: optionalString(body.description),
    phase: (optionalString(body.phase) ?? project.currentPhase) as HermesPhaseId,
    module: optionalString(body.module),
    moduleId: optionalString(body.moduleId),
    assigneeId: optionalString(body.assigneeId) ?? null,
    startDate: optionalString(body.startDate) ?? null,
    dueDate: optionalString(body.dueDate) ?? null,
    durationDays: optionalNumber(body.durationDays),
    estimatedHours: optionalNumber(body.estimatedHours),
    status: STATUSES.includes(body.status as TaskStatus) ? (body.status as TaskStatus) : undefined,
    predecessorIds: Array.isArray(body.predecessorIds)
      ? body.predecessorIds.filter((value): value is string => typeof value === "string")
      : [],
  };

  try {
    const result = await createManualTask(id, input, { id: user.id, name: user.name });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return taskExceptionResponse(error, "Création de la tâche impossible.");
  }
}
