import { listMyOpenTasks, listPendingDecisions } from "@/lib/integrations/actions";
import { absoluteUrl } from "@/lib/integrations/config";
import { copilotJson, withCopilot } from "@/lib/copilot/http";
import { isTaskOverdue } from "@/lib/reports/health";
import { todayIso } from "@/lib/reports/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withCopilot(request, async (principal) => {
    switch (principal.kind) {
      case "user": {
        const { user } = principal;
        const [tasks, decisions] = await Promise.all([listMyOpenTasks(user), listPendingDecisions(user)]);
        const today = todayIso();
        return copilotJson({
          principal: "user",
          authenticatedVia: principal.via,
          user: { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale ?? "fr" },
          canAct: true,
          openTasks: tasks.length,
          overdueTasks: tasks.filter(({ task }) => isTaskOverdue(task, today)).length,
          pendingDecisions: decisions.phaseGates.length + decisions.budgetRevisions.length,
          links: { app: absoluteUrl("/"), tasks: absoluteUrl("/taches"), reports: absoluteUrl("/rapports") },
        });
      }
      case "app":
        return copilotJson({
          principal: "application",
          appId: principal.appId,
          roles: principal.roles,
          canAct: false,
          note: "Jeton d'application : lecture seule sur tous les projets ; les actions exigent un utilisateur délégué.",
          links: { app: absoluteUrl("/") },
        });
      default: {
        const exhaustive: never = principal;
        return exhaustive;
      }
    }
  });
}
