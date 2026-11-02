import type { User } from "@/lib/auth/permissions";
import {
  getProjectScheduleSummary,
  listActivities,
  listAllUsers,
  listAuditLogByProject,
  listBudgetRevisionsByProject,
  listGeneratedDocumentsByProject,
  listPhaseValidationsByProject,
  listProjectBaselines,
  listProjectDocumentsByProject,
  listResourceProfiles,
  listTaskEstimateRevisions,
  listTasks,
  listTimeEntries,
} from "@/lib/db/store";
import type {
  Activity,
  BudgetRevision,
  PhaseValidation,
  Portfolio,
  Project,
  ProjectBaseline,
  ProjectDocument,
  ResourceProfile,
  Task,
  TaskEstimateRevision,
  TimeEntry,
} from "@/types";

export interface ProjectReportData {
  project: Project;
  portfolio?: Portfolio;
  tasks: Task[];
  activities: Activity[];
  revisions: BudgetRevision[];
  validations: PhaseValidation[];
  documents: ProjectDocument[];
  generatedOutcomes: { phase: Project["currentPhase"]; outcomeKey: string }[];
  /** Baseline le plus récent (référence des écarts). */
  baseline?: ProjectBaseline;
  criticalTaskIds: string[];
  /** Budget validé à l'origine (premier « budget.approved » du journal). */
  initialBudget?: number;
  initialBudgetApprovedAt?: string;
  /** Saisies de temps actives du projet. */
  timeEntries: TimeEntry[];
  /** Révisions de la charge prévue des tâches. */
  estimateRevisions: TaskEstimateRevision[];
}

export interface ReportDataset {
  projects: ProjectReportData[];
  users: User[];
  resourceProfiles: ResourceProfile[];
}

/** Charge (en lecture seule) toutes les données nécessaires aux rapports des projets donnés. */
export async function loadReportDataset(
  projects: Project[],
  portfolios: Portfolio[],
): Promise<ReportDataset> {
  const [allTasks, allActivities, users, resourceProfiles, allEntries, allRevisions] = await Promise.all([
    listTasks(),
    listActivities(),
    listAllUsers(),
    listResourceProfiles(),
    listTimeEntries(),
    listTaskEstimateRevisions({}),
  ]);
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));

  const data = await Promise.all(
    projects.map(async (project): Promise<ProjectReportData> => {
      const tasks = allTasks.filter((task) => task.projectId === project.id);
      const taskIds = new Set(tasks.map((task) => task.id));
      const [revisions, validations, documents, baselines, schedule, audit, generated] =
        await Promise.all([
          listBudgetRevisionsByProject(project.id),
          listPhaseValidationsByProject(project.id),
          listProjectDocumentsByProject(project.id),
          listProjectBaselines(project.id),
          getProjectScheduleSummary(project.id).catch(() => null),
          listAuditLogByProject(project.id),
          listGeneratedDocumentsByProject(project.id),
        ]);

      const firstApproval = [...audit]
        .filter((entry) => entry.action === "budget.approved")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      const approvedAmount = firstApproval?.details?.amountCHF;
      const hasApprovedRevision = revisions.some(
        (rev) => rev.status === "approved" || rev.status === "superseded",
      );

      return {
        project,
        portfolio: project.portfolioId ? portfolioById.get(project.portfolioId) : undefined,
        tasks,
        activities: allActivities.filter((activity) => taskIds.has(activity.taskId)),
        revisions,
        validations,
        documents,
        generatedOutcomes: generated.map((doc) => ({ phase: doc.phase, outcomeKey: doc.outcomeKey })),
        baseline: [...baselines].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
        criticalTaskIds: schedule?.criticalTaskIds ?? [],
        initialBudget:
          typeof approvedAmount === "number"
            ? approvedAmount
            : hasApprovedRevision || project.budgetStatus !== "approved"
              ? undefined
              : project.budget,
        initialBudgetApprovedAt: firstApproval?.createdAt ?? project.budgetApprovedAt,
        timeEntries: allEntries.filter((entry) => entry.projectId === project.id),
        estimateRevisions: allRevisions.filter((revision) => revision.projectId === project.id),
      };
    }),
  );

  return { projects: data, users, resourceProfiles };
}
