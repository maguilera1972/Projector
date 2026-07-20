import { redirect } from "next/navigation";
import {
  FolderKanban,
  CheckSquare,
  Clock,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/ui/stat-card";
import { ProjectCard } from "@/components/project/project-card";
import { OverdueTasksPanel } from "@/components/dashboard/overdue-tasks-panel";
import { PendingPvPanel } from "@/components/dashboard/pending-pv-panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getAverageProgress,
  getDashboardStats,
  getUserOverdueItems,
} from "@/lib/data/dashboard";
import { listProjects, listTasks, listUsers, getPendingPvDocumentsForUser } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { HERMES_REFERENCE_PHASES, getPhaseLabel } from "@/lib/hermes/phases";
import { getUserNameById } from "@/lib/users";
import { TASK_STATUS_LABELS } from "@/types";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const stats = await getDashboardStats(user.id);
  const overdueItems = await getUserOverdueItems(user.id);
  const pendingPvItems = await getPendingPvDocumentsForUser(user.id);
  const projects = await listProjects();
  const tasks = await listTasks();
  const users = await listUsers();
  const averageProgress = await getAverageProgress();

  const myTasks = tasks.filter(
    (task) =>
      task.assigneeId === user.id && task.status !== "termine",
  );

  const recentProjects = projects
    .filter((p) => p.status !== "termine")
    .slice(0, 3);

  const upcomingTasks = (myTasks.length > 0 ? myTasks : tasks)
    .filter((t) => t.status !== "termine")
    .slice(0, 5);

  return (
    <>
      <Header
        title="Tableau de bord"
        subtitle={`Bonjour ${user.name.split(" ")[0]} — vue d'ensemble de vos projets HERMES5`}
        user={user}
      />

      <main className="p-8">
        <PendingPvPanel items={pendingPvItems} />

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
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
            title="Mes retards"
            value={stats.myOverdueTasks}
            icon={AlertTriangle}
            trend={
              stats.myOverdueTasks > 0
                ? "Action requise"
                : "Aucun retard"
            }
          />
          <StatCard
            title="Échéances (14 j.)"
            value={stats.upcomingDeadlines}
            icon={Clock}
          />
          <StatCard
            title="Avancement moyen"
            value={`${averageProgress}%`}
            icon={TrendingUp}
          />
        </div>

        <div className="mt-8">
          <OverdueTasksPanel items={overdueItems} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Projets en cours
              </h2>
            </div>
            {recentProjects.length === 0 ? (
              <EmptyState
                title="Aucun projet"
                description="Bienvenue sur PROJECTOR. Créez votre premier projet pour commencer à piloter vos activités selon la méthode HERMES5."
                actionLabel="Créer un projet"
                user={user}
              />
            ) : (
              <div className="space-y-4">
                {recentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {myTasks.length > 0 ? "Mes tâches" : "Tâches à venir"}
            </h2>
            {upcomingTasks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-brand-muted">
                  Aucune tâche en attente.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <ul className="divide-y divide-slate-100">
                  {upcomingTasks.map((task) => {
                    const project = projects.find(
                      (p) => p.id === task.projectId,
                    );
                    const phaseLabel = project
                      ? getPhaseLabel(task.phase, project.approach)
                      : task.phase;
                    return (
                      <li key={task.id} className="p-4">
                        <p className="text-sm font-medium text-slate-900">
                          {task.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="muted">{task.module}</Badge>
                          <span className="text-xs text-brand-muted">
                            {phaseLabel}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-brand-muted">
                          <span>
                            {getUserNameById(task.assigneeId, users) ??
                              "Non assigné"}
                          </span>
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
            )}

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">
                Phases HERMES5
              </h3>
              <ul className="mt-4 space-y-3">
                {HERMES_REFERENCE_PHASES.map((phase) => (
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
