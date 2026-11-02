import type { User } from "@/lib/auth/permissions";
import { localizeTask } from "@/lib/hermes/i18n";
import { normalizeLocale } from "@/lib/i18n/config";
import { isTaskOverdue } from "@/lib/reports/health";
import type { BudgetRevision, PhaseValidation, Project, Task } from "@/types";
import { nextMilestones, overdueTasks, personName, projectReportsUrl, projectUrl, type ProjectInsight } from "./insights";
import type { LabelKit } from "./labels";
import { minutesToHours } from "@/lib/time-tracking/duration";

/** Représentations JSON compactes destinées aux LLM (identifiants, libellés lisibles, liens profonds). */

export interface ViewContext {
  kit: LabelKit;
  userById: Map<string, User>;
  /** Minutes saisies par tâche (suivi du temps). */
  minutesByTask?: Map<string, number>;
}

function person(ctx: ViewContext, id: string | undefined, designated?: string): string | null {
  return personName(ctx.userById, id, designated) || designated?.trim() || null;
}

export function projectSummaryView(ctx: ViewContext, project: Project, insight?: ProjectInsight) {
  const { kit } = ctx;
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    statusLabel: kit.projectStatus(project.status),
    phase: project.currentPhase,
    phaseLabel: kit.phase(project.currentPhase),
    approach: project.approach,
    approachLabel: kit.approach(project.approach),
    progress: Math.round(project.progress),
    weather: insight?.health.overall ?? "neutral",
    weatherLabel: kit.tone(insight?.health.overall ?? "neutral"),
    startDate: project.startDate?.slice(0, 10) ?? null,
    endDate: project.endDate?.slice(0, 10) ?? null,
    chef: person(ctx, project.chefDeProjetId, project.chefDeProjet),
    mandant: person(ctx, project.mandantUserId, project.mandant),
    portfolio: insight?.data.portfolio?.name ?? null,
    budgetCHF: project.budget ?? null,
    budgetStatus: project.budgetStatus,
    budgetStatusLabel: kit.budgetStatus(project.budgetStatus),
    url: projectUrl(project.id),
  };
}

export function taskView(ctx: ViewContext, task: Task, project: Project) {
  const { kit } = ctx;
  return {
    id: task.id,
    title: localizeTask(task, normalizeLocale(project.documentLocale)).title,
    projectId: project.id,
    projectName: project.name,
    phase: task.phase,
    phaseLabel: kit.phase(task.phase),
    status: task.status,
    statusLabel: kit.taskStatus(task.status),
    progress: Math.round(task.progress ?? 0),
    startDate: task.startDate?.slice(0, 10) ?? null,
    dueDate: task.dueDate?.slice(0, 10) ?? null,
    overdue: isTaskOverdue(task, kit.today),
    assignee: person(ctx, task.assigneeId),
    source: task.source ?? "hermes",
    description: task.description ?? null,
    plannedHours: task.estimatedHours ?? null,
    initialPlannedHours: task.initialEstimatedHours ?? null,
    timeSpentHours: minutesToHours(ctx.minutesByTask?.get(task.id) ?? 0),
    url: projectUrl(project.id),
  };
}

export function phaseGateView(ctx: ViewContext, validation: PhaseValidation, project: Project, canAct: boolean) {
  const { kit } = ctx;
  return {
    type: "phaseGate" as const,
    id: validation.id,
    projectId: project.id,
    projectName: project.name,
    fromPhase: validation.fromPhase,
    fromPhaseLabel: kit.phase(validation.fromPhase),
    toPhase: validation.toPhase,
    toPhaseLabel: kit.phase(validation.toPhase),
    status: validation.status,
    statusLabel: kit.validationStatus(validation.status),
    submittedBy: person(ctx, validation.submittedBy) ?? validation.submittedBy,
    submittedAt: validation.submittedAt,
    comment: validation.submitComment ?? null,
    checklist: (validation.checklistSnapshot ?? []).map((item) => ({ label: item.label, status: item.status })),
    canAct,
    url: projectUrl(project.id),
  };
}

export function budgetRevisionView(ctx: ViewContext, revision: BudgetRevision, project: Project, canAct: boolean) {
  const { kit } = ctx;
  return {
    type: "budgetRevision" as const,
    id: revision.id,
    projectId: project.id,
    projectName: project.name,
    amountCHF: revision.amountCHF,
    amountLabel: kit.fmt.chf(revision.amountCHF),
    currentBudgetCHF: project.budget ?? null,
    hoursForfait: revision.hoursForfait ?? null,
    reason: revision.reason ?? null,
    status: revision.status,
    statusLabel: kit.revisionStatus(revision.status),
    requestedBy: person(ctx, revision.requestedBy) ?? revision.requestedBy,
    requestedAt: revision.requestedAt,
    canAct,
    url: projectUrl(project.id),
  };
}

export function projectDetailView(
  ctx: ViewContext,
  insight: ProjectInsight,
  options: { canActAsMandant: boolean },
) {
  const { kit } = ctx;
  const { project, tasks, validations, revisions } = insight.data;
  const { health } = insight;
  const open = tasks.filter((task) => task.status !== "termine");
  const pendingGate = validations.find((validation) => validation.status === "submitted");
  const dimension = (value: { tone: typeof health.overall; reasons: string[] }) => ({
    tone: value.tone,
    label: kit.tone(value.tone),
    reasons: value.reasons,
  });

  return {
    ...projectSummaryView(ctx, project, insight),
    description: project.description?.trim() || null,
    health: {
      overall: health.overall,
      overallLabel: kit.tone(health.overall),
      schedule: dimension(health.schedule),
      budget: dimension(health.budget),
      decisions: dimension(health.decisions),
      slipDays: health.slipDays ?? null,
      budgetIncreasePct: health.budgetIncreasePct ?? null,
    },
    tasks: {
      total: tasks.length,
      done: tasks.length - open.length,
      open: open.length,
      overdue: health.overdueCount,
      blocked: health.blockedCount,
    },
    overdueTasks: overdueTasks(tasks, kit.today)
      .slice(0, 10)
      .map((task) => taskView(ctx, task, project)),
    pendingDecisions: [
      ...(pendingGate ? [phaseGateView(ctx, pendingGate, project, options.canActAsMandant)] : []),
      ...revisions
        .filter((revision) => revision.status === "pending_mandant")
        .map((revision) => budgetRevisionView(ctx, revision, project, options.canActAsMandant)),
    ],
    nextMilestones: nextMilestones(insight.data, kit),
    statusReportUrl: projectReportsUrl(project.id),
  };
}
