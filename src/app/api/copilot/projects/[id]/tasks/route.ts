import { copilotError, copilotJson, withCopilot } from "@/lib/copilot/http";
import { loadViewContext, principalLocale, principalProject } from "@/lib/copilot/service";
import { taskView } from "@/lib/copilot/views";
import { getTasksByProject } from "@/lib/db/store";
import { isTaskOverdue } from "@/lib/reports/health";
import type { TaskStatus } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FILTERS: (TaskStatus | "open" | "overdue")[] = ["a_faire", "en_cours", "termine", "bloque", "open", "overdue"];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  return withCopilot(request, async (principal) => {
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const status = search.get("status")?.trim() || undefined;
    const mine = search.get("mine") === "true";
    if (status && !FILTERS.includes(status as TaskStatus)) {
      return copilotError(400, `Filtre de statut inconnu. Valeurs : ${FILTERS.join(", ")}.`, "invalid_status");
    }
    if (mine && principal.kind !== "user") {
      return copilotError(400, "« mine=true » requiert un utilisateur délégué.", "delegated_user_required");
    }

    const project = await principalProject(principal, id);
    if (!project) return copilotError(404, "Projet introuvable ou non accessible.", "not_found");
    const view = await loadViewContext(principalLocale(principal, request));
    const userId = principal.kind === "user" ? principal.user.id : undefined;

    const tasks = (await getTasksByProject(project.id))
      .filter((task) => {
        if (mine && task.assigneeId !== userId) return false;
        switch (status) {
          case undefined:
            return true;
          case "open":
            return task.status !== "termine";
          case "overdue":
            return isTaskOverdue(task, view.kit.today);
          default:
            return task.status === status;
        }
      })
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

    return copilotJson({
      projectId: project.id,
      projectName: project.name,
      count: tasks.length,
      tasks: tasks.slice(0, 200).map((task) => taskView(view, task, project)),
      truncated: tasks.length > 200,
    });
  });
}
