import {
  FolderKanban,
  CheckSquare,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { ProjectCard } from "@/components/project/project-card";
import { Badge } from "@/components/ui/badge";
import { getDashboardStats, mockProjects, mockTasks } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { HERMES_PHASES, TASK_STATUS_LABELS } from "@/types";

export default function DashboardPage() {
  const stats = getDashboardStats();
  const recentProjects = mockProjects.filter((p) => p.status !== "termine").slice(0, 3);
  const upcomingTasks = mockTasks
    .filter((t) => t.status !== "termine")
    .slice(0, 5);

  return (
    <>
      <Header
        title="Tableau de bord"
        subtitle="Vue d'ensemble de vos projets HERMES5"
      />

      <main className="p-8">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Projets actifs"
            value={stats.activeProjects}
            icon={FolderKanban}
            trend={`${stats.totalProjects} projets au total`}
          />
          <StatCard
            title="Tâches en cours"
            value={stats.pendingTasks}
            icon={CheckSquare}
            trend={`${stats.completedTasks} terminées`}
          />
          <StatCard
            title="Échéances (14 j.)"
            value={stats.upcomingDeadlines}
            icon={Clock}
          />
          <StatCard
            title="Avancement moyen"
            value={`${Math.round(mockProjects.reduce((a, p) => a + p.progress, 0) / mockProjects.length)}%`}
            icon={TrendingUp}
          />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Projets en cours
              </h2>
            </div>
            <div className="space-y-4">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Tâches à venir
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {upcomingTasks.map((task) => {
                  const phase = HERMES_PHASES.find((p) => p.id === task.phase);
                  return (
                    <li key={task.id} className="p-4">
                      <p className="text-sm font-medium text-slate-900">
                        {task.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="muted">{task.module}</Badge>
                        <span className="text-xs text-brand-muted">
                          {phase?.label}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-brand-muted">
                        <span>{task.assignee}</span>
                        <span>{TASK_STATUS_LABELS[task.status]}</span>
                        {task.dueDate && (
                          <span>{formatDate(task.dueDate)}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Phases HERMES5
              </h3>
              <ul className="mt-4 space-y-3">
                {HERMES_PHASES.map((phase) => (
                  <li key={phase.id} className="flex gap-3">
                    <span className="gradient-brand flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                      {phase.order}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {phase.label}
                      </p>
                      <p className="text-xs text-brand-muted">
                        {phase.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
