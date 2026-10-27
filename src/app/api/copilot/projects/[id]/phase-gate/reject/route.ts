import { getProjectById } from "@/lib/db/store";
import { actionResponse, bodyText, copilotError, readJsonBody, withCopilotUser } from "@/lib/copilot/http";
import { resolveLocale } from "@/lib/copilot/labels";
import { loadViewContext } from "@/lib/copilot/service";
import { phaseGateView } from "@/lib/copilot/views";
import { rejectPhaseGateAs } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withCopilotUser(request, async (user) => {
    const { id } = await params;
    const comment = bodyText(await readJsonBody(request), "comment");
    if (!comment) return copilotError(400, "Le champ « comment » (motif du refus) est requis.", "invalid_request");
    const result = await rejectPhaseGateAs(user, id, comment);
    if (!result.ok) return copilotError(result.status, result.error);
    const project = await getProjectById(id);
    if (!project) return copilotError(404, "Projet introuvable.");
    const view = await loadViewContext(resolveLocale(null, user.locale));
    return actionResponse(result, (validation) => ({
      ok: true,
      message: `Validation de la phase ${view.kit.phase(validation.fromPhase)} refusée pour « ${project.name} ».`,
      validation: phaseGateView(view, validation, project, false),
    }));
  });
}
