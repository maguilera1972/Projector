import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PhaseTimeline } from "@/components/project/phase-timeline";
import { ProjectPlanView } from "@/components/project/project-plan-view";
import { PhaseGatePanel } from "@/components/project/phase-gate-panel";
import { ProjectDocumentsPanel } from "@/components/project/project-documents-panel";
import { GeneratedDocumentsPanel } from "@/components/project/generated-documents-panel";
import { TeamsMeetingsPanel } from "@/components/project/teams-meetings-panel";
import { TeamsWorkspacePanel } from "@/components/project/teams-workspace-panel";
import {
  getProjectById,
  getPortfolioById,
  getProjectScheduleSummary,
  getQualityGateContextForProject,
  getTasksByProject,
  listAuditLogByProject,
  listBudgetRevisionsByProject,
  listPhaseValidationsByProject,
  listProjectBaselines,
  listProjectDocumentsByProject,
  listGeneratedDocumentsByProject,
  listUsers,
} from "@/lib/db/store";
import {
  canUserActAsChefDeProjet,
  canUserActAsMandant,
  canUserManageProjectMandant,
  isPlatformAdmin,
} from "@/lib/hermes/project-roles";
import { getSessionUser } from "@/lib/auth/session";
import { canUserAssignTasksOnProject } from "@/lib/auth/task-assignment";
import { formatDate } from "@/lib/utils";
import { localizeScenario, localizeTasks } from "@/lib/hermes/i18n";
import { toAssigneeOptions } from "@/lib/users";
import { ProjectLanguageSelect } from "@/components/project/project-language-select";
import { ProjectPeriodCard } from "@/components/time/project-period-card";
import { ProjectTimePanel, type PlanningTask } from "@/components/time/project-time-panel";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isTimeAuditAction } from "@/lib/audit/log";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { isTimeManager } from "@/lib/time-tracking/access";
import { buildTaskTimeIndex, loadProjectTimeAnalysis } from "@/lib/time-tracking/service";
import { ProjectDocumentsExplorer } from "@/components/project/project-documents-explorer";
import { loadProjectDocumentsExplorer } from "@/lib/documents/explorer-data";
import { getRequestTranslator } from "@/lib/i18n/server";
import { normalizeLocale, toIntlLocale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";
import type { ProjectStatus } from "@/types";

const statusVariant: Record<
  ProjectStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  planifie: "info",
  en_cours: "default",
  en_pause: "warning",
  termine: "success",
};

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t, locale } = await getRequestTranslator();

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const projectLocale = normalizeLocale(project.documentLocale);
  const tasks = localizeTasks(await getTasksByProject(id), () => projectLocale);
  const schedule =
    (await getProjectScheduleSummary(id)) ?? {
      projectId: id,
      criticalTaskIds: [],
      nodes: [],
      dependencies: [],
    };
  const baselines = await listProjectBaselines(id);
  const gateContext =
    (await getQualityGateContextForProject(id)) ?? {
      projectId: id,
      currentPhase: project.currentPhase,
      nextPhase: null,
      approach: project.approach,
      gateLabel: "Quality gate",
      isTerminal: false,
      checklist: [],
      checklistReady: false,
      checklistReadyForSession: false,
      budgetStatus: project.budgetStatus,
      activeValidation: null,
      canAdvance: false,
      pendingPvDocuments: 0,
    };
  const budgetRevisions = await listBudgetRevisionsByProject(id);
  const phaseValidations = await listPhaseValidationsByProject(id);
  const auditLog = (await listAuditLogByProject(id)).filter(
    (entry) => !isTimeAuditAction(entry.action),
  );
  const projectDocuments = await listProjectDocumentsByProject(id);
  const generatedDocuments = await listGeneratedDocumentsByProject(id);
  const pendingBudgetDocument = projectDocuments.find(
    (doc) =>
      doc.type === "accord_budget_mandant" &&
      doc.status === "pending_signature",
  );
  const users = toAssigneeOptions(await listUsers());
  const mandantUser = project.mandantUserId
    ? users.find((u) => u.id === project.mandantUserId)
    : undefined;
  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;
  const canAssign = canUserAssignTasksOnProject(user, project, portfolio);
  const canSubmitPhase = canUserActAsChefDeProjet(user, project, portfolio);
  const canApproveAsMandant = canUserActAsMandant(user, project);
  const phaseLabel = tDynamic(t, `enums.phase.${project.currentPhase}`);
  const scenarioLabel = localizeScenario(project.scenarioId, locale)?.label ?? null;
  const documentsExplorer = await loadProjectDocumentsExplorer(id, user);
  const canManageTeams = canUserManageProjectMandant(user, project, portfolio);
  const canScheduleMeetings = canManageTeams || canApproveAsMandant || isPlatformAdmin(user);
  const canChangeLanguage =
    canSubmitPhase || user.role === "admin";
  const canManageTime = isTimeManager(user, project, portfolio);
  const canSeeTimeAnalysis =
    canManageTime ||
    (user.role !== "guest" && hasPermission(user, PERMISSIONS.REPORTS_READ));
  const timeAnalysis = await loadProjectTimeAnalysis(project, locale);
  const timeIndex = await buildTaskTimeIndex(user, tasks);
  const phaseOrder = getPhasesForApproach(project.approach).map((phase) => phase.id);
  const planningTasks: PlanningTask[] = [...tasks]
    .sort(
      (a, b) =>
        phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) ||
        (a.order ?? 0) - (b.order ?? 0),
    )
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      phase: task.phase,
      phaseLabel: tDynamic(t, `enums.phase.${task.phase}`),
      estimatedHours: task.estimatedHours ?? null,
      initialEstimatedHours: task.initialEstimatedHours ?? null,
    }));

  return (
    <>
      <Header
        title={project.name}
        subtitle={t("projectPage.currentPhase", { phase: phaseLabel })}
        user={user}
      />

      <main className="p-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Badge variant={statusVariant[project.status]}>
            {tDynamic(t, `enums.projectStatus.${project.status}`)}
          </Badge>
          <Badge variant="info">{phaseLabel}</Badge>
          <Badge variant="muted">
            {tDynamic(t, `enums.approach.${project.approach}`)}
          </Badge>
          {scenarioLabel && (
            <Badge variant="muted">{scenarioLabel}</Badge>
          )}
        </div>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">
            {t("projectPage.lifecycle")}
          </h2>
          <PhaseTimeline
            currentPhase={project.currentPhase}
            approach={project.approach}
          />
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("projectPage.description")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-muted">
                {project.description}
              </p>
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  {t("projectPage.overallProgress")}
                </p>
                <ProgressBar value={project.progress} showLabel />
              </div>
            </section>

            <PhaseGatePanel
              project={project}
              context={gateContext}
              budgetRevisions={budgetRevisions}
              validations={phaseValidations}
              auditLog={auditLog}
              pendingBudgetDocument={pendingBudgetDocument}
              canSubmit={canSubmitPhase}
              canApprove={canApproveAsMandant}
            />

            <TeamsMeetingsPanel
              projectId={project.id}
              currentPhase={project.currentPhase}
              canSchedule={canScheduleMeetings}
            />

            <ProjectPlanView
              projectId={id}
              tasks={tasks}
              approach={project.approach}
              users={users}
              canEdit={canAssign}
              schedule={schedule}
              baselines={baselines}
              timeByTask={timeIndex.timeByTask}
              canLogTaskIds={timeIndex.canLogTaskIds}
            />

            {canSeeTimeAnalysis && (
              <ProjectTimePanel
                analysis={timeAnalysis}
                canManage={canManageTime}
                planningTasks={planningTasks}
              />
            )}

            {documentsExplorer && (
              <ProjectDocumentsExplorer {...documentsExplorer} showProjectLink />
            )}

            <GeneratedDocumentsPanel
              project={project}
              documents={generatedDocuments}
              canEdit={canSubmitPhase}
            />

            <ProjectDocumentsPanel
              project={project}
              documents={projectDocuments}
              canManage={canSubmitPhase}
            />
          </div>

          <aside className="space-y-6">
            <ProjectPeriodCard
              projectId={project.id}
              period={timeAnalysis.period}
              canEdit={canManageTeams}
            />

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("projectPage.info")}
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-brand-muted">{t("projectPage.chef")}</dt>
                  <dd className="font-medium text-slate-900">
                    {project.chefDeProjet}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">{t("projectPage.mandant")}</dt>
                  <dd className="font-medium text-slate-900">
                    {project.mandant}
                    {mandantUser && (
                      <span className="mt-0.5 block text-xs font-normal text-brand-muted">
                        {mandantUser.email}
                      </span>
                    )}
                    {!project.mandantUserId && (
                      <span className="mt-1 block text-xs text-amber-700">
                        {t("projectPage.mandantNotLinked")}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">{t("projectPage.startDate")}</dt>
                  <dd className="font-medium text-slate-900">
                    {formatDate(project.startDate, locale)}
                  </dd>
                </div>
                {project.endDate && (
                  <div>
                    <dt className="text-brand-muted">{t("projectPage.endDate")}</dt>
                    <dd className="font-medium text-slate-900">
                      {formatDate(project.endDate, locale)}
                    </dd>
                  </div>
                )}
                {project.budget && (
                  <div>
                    <dt className="text-brand-muted">{t("projectPage.budget")}</dt>
                    <dd className="font-medium text-slate-900">
                      {project.budget.toLocaleString(toIntlLocale(locale))} CHF
                    </dd>
                  </div>
                )}
                {project.budgetHours && (
                  <div>
                    <dt className="text-brand-muted">{t("projectPage.hours")}</dt>
                    <dd className="font-medium text-slate-900">
                      {project.budgetHours.toLocaleString(toIntlLocale(locale))} h
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-brand-muted">{t("projectPage.tasks")}</dt>
                  <dd className="font-medium text-slate-900">
                    {t("projectPage.tasksCompleted", {
                      done: project.tasksCompleted,
                      total: project.tasksTotal,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">{t("projects.language")}</dt>
                  <dd className="mt-1">
                    <ProjectLanguageSelect
                      projectId={project.id}
                      value={projectLocale}
                      canEdit={canChangeLanguage}
                    />
                  </dd>
                </div>
              </dl>
            </section>

            <TeamsWorkspacePanel
              projectId={project.id}
              initialWorkspace={project.teams ?? null}
              canManage={canManageTeams}
            />
          </aside>
        </div>
      </main>
    </>
  );
}
