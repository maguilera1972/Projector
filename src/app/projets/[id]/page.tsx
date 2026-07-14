import { notFound } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PhaseTimeline } from "@/components/project/phase-timeline";
import { getProjectById, getTasksByProject } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import {
  HERMES_PHASES,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type ProjectStatus,
  type TaskStatus,
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

const taskStatusVariant: Record<
  TaskStatus,
  "default" | "success" | "warning" | "info" | "muted"
> = {
  a_faire: "muted",
  en_cours: "default",
  termine: "success",
  bloque: "warning",
};

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    notFound();
  }

  const tasks = getTasksByProject(id);
  const phase = HERMES_PHASES.find((p) => p.id === project.currentPhase);

  return (
    <>
      <Header
        title={project.name}
        subtitle={`Phase actuelle : ${phase?.label}`}
      />

      <main className="p-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Badge variant={statusVariant[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          <Badge variant="info">{phase?.label}</Badge>
        </div>

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-slate-900">
            Cycle de vie HERMES5
          </h2>
          <PhaseTimeline currentPhase={project.currentPhase} />
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

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Tâches ({tasks.length})
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-4 px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-brand-muted">
                        {task.module} · {task.assignee}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {task.dueDate && (
                        <span className="text-xs text-brand-muted">
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                      <Badge variant={taskStatusVariant[task.status]}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Informations
              </h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-brand-muted">Chef de projet</dt>
                  <dd className="font-medium text-slate-900">{project.chefDeProjet}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Mandant</dt>
                  <dd className="font-medium text-slate-900">{project.mandant}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Date de début</dt>
                  <dd className="font-medium text-slate-900">{formatDate(project.startDate)}</dd>
                </div>
                {project.endDate && (
                  <div>
                    <dt className="text-brand-muted">Date de fin prévue</dt>
                    <dd className="font-medium text-slate-900">{formatDate(project.endDate)}</dd>
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
