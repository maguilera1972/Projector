import { copilotJson, withCopilot } from "@/lib/copilot/http";
import { canPrincipalActAsMandant, loadViewContext, principalLocale, principalPendingDecisions } from "@/lib/copilot/service";
import { budgetRevisionView, phaseGateView } from "@/lib/copilot/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withCopilot(request, async (principal) => {
    const [pending, view] = await Promise.all([
      principalPendingDecisions(principal),
      loadViewContext(principalLocale(principal, request)),
    ]);
    const phaseGates = pending.phaseGates.map(({ validation, project }) =>
      phaseGateView(view, validation, project, canPrincipalActAsMandant(principal, project)),
    );
    const budgetRevisions = pending.budgetRevisions.map(({ revision, project }) =>
      budgetRevisionView(view, revision, project, canPrincipalActAsMandant(principal, project)),
    );
    return copilotJson({
      scope: principal.kind === "user" ? "mandant" : "all",
      count: phaseGates.length + budgetRevisions.length,
      phaseGates,
      budgetRevisions,
    });
  });
}
