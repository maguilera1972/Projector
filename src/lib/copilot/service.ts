import { listAllUsers, listProjects, listTimeEntries } from "@/lib/db/store";
import { minutesByTask } from "@/lib/time-tracking/summary";
import { canUserActAsMandant } from "@/lib/hermes/project-roles";
import type { Locale } from "@/lib/i18n/config";
import {
  getVisibleProject,
  listPendingDecisions,
  listVisibleProjects,
  type PendingDecisions,
} from "@/lib/integrations/actions";
import type { Project } from "@/types";
import type { CopilotPrincipal } from "./auth";
import { loadProjectInsights, type InsightDataset } from "./insights";
import { createLabelKit, resolveLocale, type LabelKit } from "./labels";
import type { ViewContext } from "./views";

/** Accès aux données selon l'appelant : droits PROJECTOR (délégué) ou lecture globale (application). */

export async function principalProjects(principal: CopilotPrincipal): Promise<Project[]> {
  switch (principal.kind) {
    case "user":
      return listVisibleProjects(principal.user);
    case "app":
      return [...(await listProjects())].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
}

export async function principalProject(principal: CopilotPrincipal, projectId: string): Promise<Project | null> {
  switch (principal.kind) {
    case "user":
      return getVisibleProject(principal.user, projectId);
    case "app":
      return (await listProjects()).find((project) => project.id === projectId) ?? null;
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
}

export async function principalPendingDecisions(principal: CopilotPrincipal): Promise<PendingDecisions> {
  switch (principal.kind) {
    case "user":
      return listPendingDecisions(principal.user);
    case "app":
      return listPendingDecisions(null, { all: true });
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
}

export function canPrincipalActAsMandant(principal: CopilotPrincipal, project: Project): boolean {
  return principal.kind === "user" && canUserActAsMandant(principal.user, project);
}

export function principalLocale(principal: CopilotPrincipal, request: Request): Locale {
  const requested = new URL(request.url).searchParams.get("locale");
  return resolveLocale(requested, principal.kind === "user" ? principal.user.locale : undefined);
}

export interface PrincipalContext {
  kit: LabelKit;
  insights: InsightDataset;
  view: ViewContext;
}

export async function loadContext(projects: Project[], locale: Locale): Promise<PrincipalContext> {
  const kit = createLabelKit(locale);
  const insights = await loadProjectInsights(projects, kit);
  return { kit, insights, view: { kit, userById: insights.userById } };
}

/** Contexte de rendu sans calcul de météo (réponses des actions). */
export async function loadViewContext(locale: Locale): Promise<ViewContext> {
  const [users, entries] = await Promise.all([listAllUsers(), listTimeEntries()]);
  return {
    kit: createLabelKit(locale),
    userById: new Map(users.map((user) => [user.id, user])),
    minutesByTask: minutesByTask(entries),
  };
}
