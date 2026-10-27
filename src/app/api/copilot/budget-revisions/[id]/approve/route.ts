import { actionResponse, bodyText, readJsonBody, withCopilotUser } from "@/lib/copilot/http";
import { resolveLocale } from "@/lib/copilot/labels";
import { loadViewContext } from "@/lib/copilot/service";
import { budgetRevisionView, projectSummaryView } from "@/lib/copilot/views";
import { approveBudgetRevisionAs } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withCopilotUser(request, async (user) => {
    const { id } = await params;
    const signatureText = bodyText(await readJsonBody(request), "signatureText", 200);
    const result = await approveBudgetRevisionAs(user, id, signatureText);
    const view = await loadViewContext(resolveLocale(null, user.locale));
    return actionResponse(result, ({ project, revision }) => ({
      ok: true,
      message: `Révision budgétaire à ${view.kit.fmt.chf(revision.amountCHF)} approuvée pour « ${project.name} ».`,
      revision: budgetRevisionView(view, revision, project, false),
      project: projectSummaryView(view, project),
    }));
  });
}
