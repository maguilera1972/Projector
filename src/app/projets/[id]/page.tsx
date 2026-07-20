import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PhaseTimeline } from "@/components/project/phase-timeline";
import { ProjectPlanView } from "@/components/project/project-plan-view";
import { PhaseGatePanel } from "@/components/project/phase-gate-panel";
import { ProjectDocumentsPanel } from "@/components/project/project-documents-panel";
import { GeneratedDocumentsPanel } from "@/components/project/generated-documents-panel";
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
} from "@/lib/hermes/project-roles";
import { getSessionUser } from "@/lib/auth/session";
import { canUserAssignTasksOnProject } from "@/lib/auth/task-assignment";
import { formatDate } from "@/lib/utils";
import { getPhaseLabel, HERMES_APPROACH_LABELS } from "@/lib/hermes/phases";
import { getScenarioLabel } from "@/lib/hermes/project-tasks";
import { toAssigneeOptions } from "@/lib/users";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/types";

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

  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const tasks = await getTasksByProject(id);
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
  const auditLog = await listAuditLogByProject(id);
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
  const phaseLabel = getPhaseLabel(project.currentPhase, project.approach);
  const scenarioLabel = getScenarioLabel(project.scenarioId);

  return (
    <>
      <Header
        title={project.name}
        subtitle={`Phase actuelle : ${phaseLabel}`}
        user={user}
      />

      <main className="p-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Badge variant={statusVariant[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          <Badge variant="info">{phaseLabel}</Badge>
          <Badge variant="muted">
            {HERMES_APPROACH_LABELS[project.approach]}
          </Badge>
          {scenarioLabel && (
            <Badge variant="muted">{scenarioLabel}</Badge>
          )}
        </div>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">
            Cycle de vie HERMES5
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
                Description
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-muted">
                {project.description}
              </p>
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Avancement global
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

            <ProjectPlanView
              projectId={id}
              tasks={tasks}
              approach={project.approach}
              users={users}
              canEdit={canAssign}
              schedule={schedule}
              baselines={baselines}
            />

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
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Informations
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-brand-muted">Chef de projet</dt>
                  <dd className="font-medium text-slate-900">
                    {project.chefDeProjet}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Mandant</dt>
                  <dd className="font-medium text-slate-900">
                    {project.mandant}
                    {mandantUser && (
                      <span className="mt-0.5 block text-xs font-normal text-brand-muted">
                        {mandantUser.email}
                      </span>
                    )}
                    {!project.mandantUserId && (
                      <span className="mt-1 block text-xs text-amber-700">
                        Compte non lié — assignez le mandant dans
                        Administration.
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Date de début</dt>
                  <dd className="font-medium text-slate-900">
                    {formatDate(project.startDate)}
                  </dd>
                </div>
                {project.endDate && (
                  <div>
                    <dt className="text-brand-muted">Date de fin prévue</dt>
                    <dd className="font-medium text-slate-900">
                      {formatDate(project.endDate)}
                    </dd>
                  </div>
                )}
                {project.budget && (
                  <div>
                    <dt className="text-brand-muted">Budget</dt>
                    <dd className="font-medium text-slate-900">
                      {project.budget.toLocaleString("fr-CH")} CHF
                    </dd>
                  </div>
                )}
                {project.budgetHours && (
                  <div>
                    <dt className="text-brand-muted">Forfait heures</dt>
                    <dd className="font-medium text-slate-900">
                      {project.budgetHours.toLocaleString("fr-CH")} h
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-brand-muted">Tâches</dt>
                  <dd className="font-medium text-slate-900">
                    {project.tasksCompleted} / {project.tasksTotal} complétées
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
