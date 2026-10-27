import { getProjectById } from "@/lib/db/store";
import { actionResponse, bodyText, copilotError, readJsonBody, withCopilotUser } from "@/lib/copilot/http";
import { resolveLocale } from "@/lib/copilot/labels";
import { loadViewContext } from "@/lib/copilot/service";
import { taskView } from "@/lib/copilot/views";
import { commentTaskAs } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withCopilotUser(request, async (user) => {
    const { id } = await params;
    const text = bodyText(await readJsonBody(request), "text");
    if (!text) return copilotError(400, "Le champ « text » (commentaire) est requis.", "invalid_request");
    const result = await commentTaskAs(user, id, text);
    if (!result.ok) return copilotError(result.status, result.error);
    const project = await getProjectById(result.value.projectId);
    if (!project) return copilotError(404, "Projet introuvable.");
    const view = await loadViewContext(resolveLocale(null, user.locale));
    return actionResponse(result, (task) => {
      const item = taskView(view, task, project);
      return { ok: true, message: `Commentaire ajouté à la tâche « ${item.title} ».`, task: item };
    });
  });
}
