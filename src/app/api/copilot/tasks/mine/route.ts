import { copilotJson, withCopilotUser } from "@/lib/copilot/http";
import { loadViewContext } from "@/lib/copilot/service";
import { resolveLocale } from "@/lib/copilot/labels";
import { taskView } from "@/lib/copilot/views";
import { listMyOpenTasks } from "@/lib/integrations/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return withCopilotUser(request, async (user) => {
    const locale = resolveLocale(new URL(request.url).searchParams.get("locale"), user.locale);
    const [items, view] = await Promise.all([listMyOpenTasks(user), loadViewContext(locale)]);
    const tasks = items.map(({ task, project }) => taskView(view, task, project));
    return copilotJson({
      count: tasks.length,
      overdue: tasks.filter((task) => task.overdue).length,
      tasks: tasks.slice(0, 200),
      truncated: tasks.length > 200,
    });
  });
}
