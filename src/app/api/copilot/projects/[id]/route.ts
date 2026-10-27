import { copilotError, copilotJson, withCopilot } from "@/lib/copilot/http";
import { canPrincipalActAsMandant, loadContext, principalLocale, principalProject } from "@/lib/copilot/service";
import { projectDetailView } from "@/lib/copilot/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  return withCopilot(request, async (principal) => {
    const { id } = await params;
    const project = await principalProject(principal, id);
    if (!project) return copilotError(404, "Projet introuvable ou non accessible.", "not_found");
    const context = await loadContext([project], principalLocale(principal, request));
    const insight = context.insights.byProjectId.get(project.id);
    if (!insight) return copilotError(404, "Projet introuvable ou non accessible.", "not_found");
    return copilotJson(
      projectDetailView(context.view, insight, { canActAsMandant: canPrincipalActAsMandant(principal, project) }),
    );
  });
}
