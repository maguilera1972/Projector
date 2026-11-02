import type { SessionUser } from "@/lib/auth/permissions";
import {
  getIntegrationSettings,
  listAllBudgetRevisions,
  listAllPhaseValidations,
  listTasks,
  listTimeEntries,
  listUsers,
} from "@/lib/db/store";
import { minutesByTask } from "@/lib/time-tracking/summary";
import { normalizeLocale } from "@/lib/i18n/config";
import { listPendingDecisions, listVisibleProjects } from "@/lib/integrations/actions";
import type { Project } from "@/types";
import type { BudgetDecisionItem, GateDecisionItem, ProjectStatusData } from "./cards";
import { isOverdue, todayIso } from "./cards";
import { normalizeText } from "./commands";
import { getBotI18n, type BotI18n } from "./i18n";

/** Langue de réponse : celle du compte PROJECTOR lié, sinon celle du client Teams, sinon le français. */
export function botI18nFor(user: SessionUser | null, activityLocale?: string): BotI18n {
  return getBotI18n(normalizeLocale(user?.locale ?? activityLocale));
}

/** Projet visible par identifiant ou nom (exact, préfixe, partiel), sans tenir compte des accents. */
export async function findProjectForUser(user: SessionUser, query: string): Promise<Project | null> {
  const needle = normalizeText(query);
  if (!needle) return null;
  const projects = await listVisibleProjects(user);
  const named = projects.map((project) => ({ project, name: normalizeText(project.name) }));
  const words = needle.split(" ");
  return (
    projects.find((project) => project.id === query.trim()) ??
    named.find((item) => item.name === needle)?.project ??
    named.find((item) => item.name.startsWith(needle))?.project ??
    named.find((item) => item.name.includes(needle))?.project ??
    named.find((item) => words.every((word) => item.name.includes(word)))?.project ??
    null
  );
}

export async function buildProjectStatus(project: Project): Promise<ProjectStatusData> {
  const [tasks, validations, revisions, settings] = await Promise.all([
    listTasks(),
    listAllPhaseValidations(),
    listAllBudgetRevisions(),
    getIntegrationSettings(),
  ]);
  const today = todayIso();
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const open = projectTasks.filter((task) => task.status !== "termine");
  return {
    project,
    weather: settings.projectWeather?.[project.id],
    totalTasks: projectTasks.length,
    completedTasks: projectTasks.length - open.length,
    openTasks: open.length,
    overdueTasks: open.filter((task) => isOverdue(task, today)).length,
    blockedTasks: open.filter((task) => task.status === "bloque").length,
    pendingGate: validations.find(
      (validation) => validation.projectId === project.id && validation.status === "submitted",
    ),
    pendingBudget: revisions.find(
      (revision) => revision.projectId === project.id && revision.status === "pending_mandant",
    ),
  };
}

/** Décisions en attente de l'utilisateur (mandant), avec le nom des demandeurs. */
export async function buildPendingDecisions(
  user: SessionUser,
): Promise<{ gates: GateDecisionItem[]; budgets: BudgetDecisionItem[] }> {
  const [pending, users] = await Promise.all([listPendingDecisions(user), listUsers()]);
  const nameById = new Map(users.map((item) => [item.id, item.name]));
  return {
    gates: pending.phaseGates.map(({ validation, project }) => ({
      project,
      validation,
      submittedByName: nameById.get(validation.submittedBy),
    })),
    budgets: pending.budgetRevisions.map(({ revision, project }) => ({
      project,
      revision,
      requestedByName: nameById.get(revision.requestedBy),
    })),
  };
}

/** Ajoute à chaque tâche le temps total saisi (minutes). */
export async function withTaskTime<T extends { task: { id: string } }>(
  items: T[],
): Promise<(T & { minutesSpent: number })[]> {
  const totals = minutesByTask(await listTimeEntries());
  return items.map((item) => ({ ...item, minutesSpent: totals.get(item.task.id) ?? 0 }));
}
