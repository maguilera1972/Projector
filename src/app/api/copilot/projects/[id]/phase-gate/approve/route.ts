import { actionResponse, bodyText, readJsonBody, withCopilotUser } from "@/lib/copilot/http";
import { resolveLocale } from "@/lib/copilot/labels";
import { loadViewContext } from "@/lib/copilot/service";
import { phaseGateView, projectSummaryView } from "@/lib/copilot/views";
import { approvePhaseGateAs } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withCopilotUser(request, async (user) => {
    const { id } = await params;
    const signatureText = bodyText(await readJsonBody(request), "signatureText", 200);
    const result = await approvePhaseGateAs(user, id, signatureText);
    const view = await loadViewContext(resolveLocale(null, user.locale));
    return actionResponse(result, ({ project, validation }) => ({
      ok: true,
      message: `Phase ${view.kit.phase(validation.fromPhase)} validée : le projet « ${project.name} » passe en ${view.kit.phase(validation.toPhase)}.`,
      validation: phaseGateView(view, validation, project, false),
      project: projectSummaryView(view, project),
    }));
  });
}
