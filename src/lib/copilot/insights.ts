import type { User } from "@/lib/auth/permissions";
import { listPortfolios } from "@/lib/db/store";
import { localizeTask } from "@/lib/hermes/i18n";
import { getNextPhase } from "@/lib/hermes/phases";
import { normalizeLocale } from "@/lib/i18n/config";
import { absoluteUrl } from "@/lib/integrations/config";
import { loadReportDataset, type ProjectReportData, type ReportDataset } from "@/lib/reports/data";
import { computeProjectHealth, isTaskOverdue, type ProjectHealth } from "@/lib/reports/health";
import type { Portfolio, Project, Task } from "@/types";
import type { LabelKit } from "./labels";

/** Données consolidées d'un projet (rapports) et météo calculée. */
export interface ProjectInsight {
  data: ProjectReportData;
  health: ProjectHealth;
}

export interface InsightDataset {
  dataset: ReportDataset;
  portfolios: Portfolio[];
  byProjectId: Map<string, ProjectInsight>;
  userById: Map<string, User>;
}

export async function loadProjectInsights(projects: Project[], kit: LabelKit): Promise<InsightDataset> {
  const portfolios = await listPortfolios(true);
  const dataset = await loadReportDataset(projects, portfolios);
  const byProjectId = new Map<string, ProjectInsight>();
  for (const data of dataset.projects) {
    byProjectId.set(data.project.id, {
      data,
      health: computeProjectHealth(data, kit.rt, kit.fmt, kit.today),
    });
  }
  return {
    dataset,
    portfolios,
    byProjectId,
    userById: new Map(dataset.users.map((user) => [user.id, user])),
  };
}

export function personName(userById: Map<string, User>, id: string | undefined, designated?: string): string {
  if (id && userById.has(id)) return userById.get(id)!.name;
  return designated?.trim() ?? "";
}

export function projectUrl(projectId: string): string {
  return absoluteUrl(`/projets/${encodeURIComponent(projectId)}`);
}

export function projectReportsUrl(projectId: string): string {
  return absoluteUrl(`/rapports?type=status&scope=project&projectId=${encodeURIComponent(projectId)}`);
}

export interface Milestone {
  kind: "task" | "phaseGate" | "projectEnd";
  label: string;
  date?: string;
  taskId?: string;
}

/** Prochaines échéances : tâches ouvertes à venir, prochain quality gate, fin de projet. */
export function nextMilestones(data: ProjectReportData, kit: LabelKit, limit = 5): Milestone[] {
  const { project } = data;
  const milestones: Milestone[] = data.tasks
    .filter((task) => task.status !== "termine" && task.dueDate && task.dueDate.slice(0, 10) >= kit.today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, limit)
    .map((task) => ({
      kind: "task",
      label: localizeTask(task, normalizeLocale(project.documentLocale)).title,
      date: task.dueDate!.slice(0, 10),
      taskId: task.id,
    }));

  if (project.status !== "termine") {
    const next = getNextPhase(project.currentPhase, project.approach);
    if (next) {
      const phaseEnd = data.tasks
        .filter((task) => task.phase === project.currentPhase && task.dueDate)
        .map((task) => task.dueDate!.slice(0, 10))
        .sort()
        .pop();
      milestones.push({
        kind: "phaseGate",
        label: `Quality gate ${kit.phase(project.currentPhase)} → ${kit.phase(next)}`,
        date: phaseEnd,
      });
    }
    if (project.endDate) {
      milestones.push({ kind: "projectEnd", label: kit.rt("status.endDate"), date: project.endDate.slice(0, 10) });
    }
  }
  return milestones;
}

export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((task) => isTaskOverdue(task, today))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

/** Date de dernière modification connue d'un projet (tâches, décisions, budget). */
export function lastModifiedOf(data: ProjectReportData): string {
  const candidates = [
    data.project.createdAt,
    data.project.budgetApprovedAt,
    ...data.tasks.flatMap((task) => [task.updatedAt, task.completedAt, task.startedAt]),
    ...data.validations.flatMap((validation) => [
      validation.submittedAt,
      validation.approvedAt,
      validation.rejectedAt,
    ]),
    ...data.revisions.flatMap((revision) => [revision.requestedAt, revision.approvedAt]),
  ].filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value!)));
  const latest = candidates.reduce(
    (max, value) => (Date.parse(value) > Date.parse(max) ? value : max),
    candidates[0] ?? new Date(0).toISOString(),
  );
  return new Date(latest).toISOString();
}
