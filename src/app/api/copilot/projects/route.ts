import { copilotError, copilotJson, withCopilot } from "@/lib/copilot/http";
import { loadContext, principalLocale, principalProjects } from "@/lib/copilot/service";
import { projectSummaryView } from "@/lib/copilot/views";
import type { ProjectStatus } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES: (ProjectStatus | "active")[] = ["planifie", "en_cours", "en_pause", "termine", "active"];
const WEATHERS = ["green", "orange", "red", "neutral"];

export async function GET(request: Request) {
  return withCopilot(request, async (principal) => {
    const search = new URL(request.url).searchParams;
    const q = search.get("q")?.trim().toLowerCase() ?? "";
    const status = search.get("status")?.trim() || undefined;
    const weather = search.get("weather")?.trim() || undefined;
    const limit = Math.min(Math.max(Number(search.get("limit") ?? 50) || 50, 1), 200);
    if (status && !STATUSES.includes(status as ProjectStatus | "active")) {
      return copilotError(400, `Statut inconnu. Valeurs : ${STATUSES.join(", ")}.`, "invalid_status");
    }
    if (weather && !WEATHERS.includes(weather)) {
      return copilotError(400, `Météo inconnue. Valeurs : ${WEATHERS.join(", ")}.`, "invalid_weather");
    }

    const projects = (await principalProjects(principal)).filter((project) => {
      if (status === "active" && project.status === "termine") return false;
      if (status && status !== "active" && project.status !== status) return false;
      if (!q) return true;
      return [project.name, project.id, project.chefDeProjet, project.mandant, project.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
    const context = await loadContext(projects, principalLocale(principal, request));
    const items = projects
      .map((project) => projectSummaryView(context.view, project, context.insights.byProjectId.get(project.id)))
      .filter((item) => !weather || item.weather === weather);

    return copilotJson({ count: items.length, projects: items.slice(0, limit), truncated: items.length > limit });
  });
}
