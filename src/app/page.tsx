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
import { HERMES_REFERENCE_PHASES } from "@/lib/hermes/phases";
import { getLocalizedPhases, localizeTasks } from "@/lib/hermes/i18n";
import { getUserNameById } from "@/lib/users";
import { getRequestTranslator } from "@/lib/i18n/server";
import { normalizeLocale } from "@/lib/i18n/config";
import { tDynamic } from "@/lib/i18n/translate";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t, locale } = await getRequestTranslator();

  const stats = await getDashboardStats(user.id);
  const overdueItems = await getUserOverdueItems(user.id);
  const pendingPvItems = await getPendingPvDocumentsForUser(user.id);
  const projects = await listProjects();
  const projectLocale = new Map(
    projects.map((p) => [p.id, normalizeLocale(p.documentLocale)]),
  );
  const tasks = localizeTasks(await listTasks(), (id) => projectLocale.get(id) ?? "fr");
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
        title={t("dashboard.title")}
        subtitle={t("dashboard.greeting", { name: user.name.split(" ")[0] })}
        user={user}
      />

      <main className="p-8">
        <PendingPvPanel items={pendingPvItems} />

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title={t("dashboard.activeProjects")}
            value={stats.activeProjects}
            icon={FolderKanban}
            trend={t("dashboard.totalProjects", { count: stats.totalProjects })}
          />
          <StatCard
            title={t("dashboard.tasksInProgress")}
            value={stats.pendingTasks}
            icon={CheckSquare}
            trend={t("dashboard.completedCount", { count: stats.completedTasks })}
          />
          <StatCard
            title={t("dashboard.myOverdue")}
            value={stats.myOverdueTasks}
            icon={AlertTriangle}
            trend={
              stats.myOverdueTasks > 0
                ? t("dashboard.actionRequired")
                : t("dashboard.noDelay")
            }
          />
          <StatCard
            title={t("dashboard.deadlines14")}
            value={stats.upcomingDeadlines}
            icon={Clock}
          />
          <StatCard
            title={t("dashboard.averageProgress")}
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
                {t("dashboard.currentProjects")}
              </h2>
            </div>
            {recentProjects.length === 0 ? (
              <EmptyState
                title={t("dashboard.noProjects")}
                description={t("dashboard.welcome")}
                actionLabel={t("dashboard.createProject")}
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
              {myTasks.length > 0 ? t("dashboard.myTasks") : t("dashboard.upcomingTasks")}
            </h2>
            {upcomingTasks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-brand-muted">
                  {t("dashboard.noPendingTasks")}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <ul className="divide-y divide-slate-100">
                  {upcomingTasks.map((task) => {
                    const phaseLabel = tDynamic(t, `enums.phase.${task.phase}`);
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
                              t("common.unassigned")}
                          </span>
                          <span>{tDynamic(t, `enums.taskStatus.${task.status}`)}</span>
                          {task.dueDate && (
                            <span>{formatDate(task.dueDate, locale)}</span>
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
                {t("dashboard.hermesPhases")}
              </h3>
              <ul className="mt-4 space-y-3">
                {getLocalizedPhases(HERMES_REFERENCE_PHASES, "classic", locale).map((phase) => (
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
