import { getProjectById } from "@/lib/db/store";
import { actionResponse, copilotError, withCopilotUser } from "@/lib/copilot/http";
import { resolveLocale } from "@/lib/copilot/labels";
import { loadViewContext } from "@/lib/copilot/service";
import { taskView } from "@/lib/copilot/views";
import { completeTaskAs } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withCopilotUser(request, async (user) => {
    const { id } = await params;
    const result = await completeTaskAs(user, id);
    if (!result.ok) return copilotError(result.status, result.error);
    const project = await getProjectById(result.value.projectId);
    if (!project) return copilotError(404, "Projet introuvable.");
    const view = await loadViewContext(resolveLocale(null, user.locale));
    return actionResponse(result, (task) => {
      const item = taskView(view, task, project);
      return { ok: true, message: `Tâche « ${item.title} » marquée comme terminée.`, task: item };
    });
  });
}
