import {
  hasPermission,
  isUserActive,
  PERMISSIONS,
  type SessionUser,
  type User,
} from "@/lib/auth/permissions";
import {
  listActivities,
  listPortfolios,
  listProjects,
  listTasks,
  listUsers,
} from "@/lib/db/store";
import { canUserActAsChefDeProjet, canUserActAsMandant } from "@/lib/hermes/project-roles";
import { isLocale, normalizeLocale, type Locale } from "@/lib/i18n/config";
import type { Activity, Portfolio, Project, Task } from "@/types";
import { isIsoDate } from "./format";
import {
  isReportType,
  PROJECT_ONLY_REPORTS,
  type ReportParams,
  type ReportRecipient,
  type ReportScope,
} from "./types";

export function canViewReports(user: Pick<SessionUser, "role" | "permissions">): boolean {
  return hasPermission(user, PERMISSIONS.REPORTS_READ);
}

function matches(user: Pick<User, "name" | "email">, designated?: string): boolean {
  const value = designated?.trim().toLowerCase();
  if (!value) return false;
  return user.name.toLowerCase() === value || user.email.toLowerCase() === value;
}

/**
 * Projets visibles dans les rapports : tous pour les administrateurs et utilisateurs internes,
 * uniquement les projets auxquels l'invité externe est lié (rôle, tâche, activité, ressource portfolio).
 */
export function isProjectVisibleInReports(
  user: SessionUser,
  project: Project,
  portfolio: Portfolio | undefined,
  tasks: Task[],
  activities: Activity[],
): boolean {
  if (user.role !== "guest") return true;
  if (canUserActAsChefDeProjet(user, project, portfolio)) return true;
  if (canUserActAsMandant(user, project)) return true;
  if (portfolio?.sharedResourceIds?.includes(user.id)) return true;
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  if (projectTasks.some((task) => task.assigneeId === user.id)) return true;
  const taskIds = new Set(projectTasks.map((task) => task.id));
  return activities.some(
    (activity) => taskIds.has(activity.taskId) && activity.assigneeId === user.id,
  );
}

export interface ReportableScope {
  projects: Project[];
  portfolios: Portfolio[];
}

export async function listReportableProjects(user: SessionUser): Promise<ReportableScope> {
  if (!canViewReports(user)) return { projects: [], portfolios: [] };
  const [projects, portfolios, tasks, activities] = await Promise.all([
    listProjects(),
    listPortfolios(true),
    listTasks(),
    listActivities(),
  ]);
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
  const visible = projects
    .filter((project) =>
      isProjectVisibleInReports(
        user,
        project,
        project.portfolioId ? portfolioById.get(project.portfolioId) : undefined,
        tasks,
        activities,
      ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const usedPortfolioIds = new Set(visible.map((project) => project.portfolioId).filter(Boolean));
  return {
    projects: visible,
    portfolios: portfolios
      .filter((portfolio) => usedPortfolioIds.has(portfolio.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
}

export type ScopeResolution =
  | { ok: true; projects: Project[]; portfolio?: Portfolio; portfolios: Portfolio[] }
  | { ok: false; status: 400 | 403 | 404; code: "forbidden" | "notFound" | "projectRequired" };

export async function resolveReportScope(
  user: SessionUser,
  params: ReportParams,
): Promise<ScopeResolution> {
  if (!canViewReports(user)) return { ok: false, status: 403, code: "forbidden" };
  if (PROJECT_ONLY_REPORTS.includes(params.type) && params.scope.kind !== "project") {
    return { ok: false, status: 400, code: "projectRequired" };
  }

  const { projects, portfolios } = await listReportableProjects(user);
  const scope = params.scope;
  if (scope.kind === "project") {
    const project = projects.find((item) => item.id === scope.projectId);
    if (!project) return { ok: false, status: 404, code: "notFound" };
    return {
      ok: true,
      projects: [project],
      portfolio: portfolios.find((item) => item.id === project.portfolioId),
      portfolios,
    };
  }
  if (scope.kind === "portfolio") {
    const portfolio = portfolios.find((item) => item.id === scope.portfolioId);
    if (!portfolio) return { ok: false, status: 404, code: "notFound" };
    return {
      ok: true,
      projects: projects.filter((project) => project.portfolioId === portfolio.id),
      portfolio,
      portfolios,
    };
  }
  return { ok: true, projects, portfolios };
}

/** Lit les paramètres d'un rapport (query string ou corps JSON). */
export function parseReportParams(
  input: URLSearchParams | Record<string, unknown>,
  fallbackLocale: Locale,
): ReportParams | null {
  const get = (key: string): string | undefined => {
    const value = input instanceof URLSearchParams ? input.get(key) : input[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  const type = get("type");
  if (!isReportType(type)) return null;

  const scopeKind = get("scope") ?? (get("projectId") ? "project" : get("portfolioId") ? "portfolio" : "all");
  let scope: ReportScope;
  if (scopeKind === "project") {
    const projectId = get("projectId");
    if (!projectId) return null;
    scope = { kind: "project", projectId };
  } else if (scopeKind === "portfolio") {
    const portfolioId = get("portfolioId");
    if (!portfolioId) return null;
    scope = { kind: "portfolio", portfolioId };
  } else if (scopeKind === "all") {
    scope = { kind: "all" };
  } else {
    return null;
  }

  const from = get("from");
  const to = get("to");
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return null;
  if (from && to && from > to) return null;

  const locale = get("locale");
  return {
    type,
    scope,
    from,
    to,
    locale: isLocale(locale) ? locale : fallbackLocale,
  };
}

export function reportParamsToSearch(params: ReportParams): URLSearchParams {
  const search = new URLSearchParams({ type: params.type, scope: params.scope.kind });
  if (params.scope.kind === "project") search.set("projectId", params.scope.projectId);
  if (params.scope.kind === "portfolio") search.set("portfolioId", params.scope.portfolioId);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  search.set("locale", params.locale);
  return search;
}

type RecipientRole =
  | "chef"
  | "mandant"
  | "portfolioOwner"
  | "assignee"
  | "activityAssignee"
  | "team";

/** Personnes assignées aux projets du rapport (comptes actifs avec e-mail). */
export async function listReportRecipients(
  projects: Project[],
  portfolios: Portfolio[],
): Promise<(Omit<ReportRecipient, "roles"> & { userId: string; roles: RecipientRole[] })[]> {
  const [users, tasks, activities] = await Promise.all([listUsers(), listTasks(), listActivities()]);
  const active = users.filter((user) => isUserActive(user) && user.email?.includes("@"));
  const byId = new Map(active.map((user) => [user.id, user]));
  const roles = new Map<string, Set<RecipientRole>>();

  const add = (user: User | undefined, role: RecipientRole) => {
    if (!user) return;
    const set = roles.get(user.id) ?? new Set<RecipientRole>();
    set.add(role);
    roles.set(user.id, set);
  };
  const resolve = (id?: string, designated?: string) =>
    (id ? byId.get(id) : undefined) ?? active.find((user) => matches(user, designated));

  const projectIds = new Set(projects.map((project) => project.id));
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));

  for (const project of projects) {
    add(resolve(project.chefDeProjetId, project.chefDeProjet), "chef");
    add(resolve(project.mandantUserId, project.mandant), "mandant");
    const portfolio = project.portfolioId ? portfolioById.get(project.portfolioId) : undefined;
    if (portfolio) {
      add(resolve(portfolio.ownerId, portfolio.owner), "portfolioOwner");
      for (const id of portfolio.sharedResourceIds ?? []) add(byId.get(id), "team");
    }
  }

  const projectTasks = tasks.filter((task) => projectIds.has(task.projectId));
  const taskIds = new Set(projectTasks.map((task) => task.id));
  for (const task of projectTasks) {
    if (task.assigneeId) add(byId.get(task.assigneeId), "assignee");
  }
  for (const activity of activities) {
    if (activity.assigneeId && taskIds.has(activity.taskId)) {
      add(byId.get(activity.assigneeId), "activityAssignee");
    }
  }

  return [...roles.entries()]
    .map(([id, set]) => {
      const user = byId.get(id)!;
      return {
        userId: user.id,
        name: user.name,
        email: user.email,
        locale: normalizeLocale(user.locale),
        roles: [...set],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
