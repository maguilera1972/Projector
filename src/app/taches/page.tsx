import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TasksTable } from "@/components/task/tasks-table";
import { WeeklyTimesheet } from "@/components/time/weekly-timesheet";
import { EmptyState } from "@/components/ui/empty-state";
import { listPortfolios, listProjects, listTasks, listUsers } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { buildProjectAssignmentAccess } from "@/lib/auth/task-assignment";
import { toAssigneeOptions } from "@/lib/users";
import { localizeTasks } from "@/lib/hermes/i18n";
import { normalizeLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";
import { getTimeTranslator } from "@/lib/time-tracking/i18n";
import { buildTaskTimeIndex, listMyTimesheetTasks } from "@/lib/time-tracking/service";

interface TachesPageProps {
  searchParams: Promise<{ vue?: string }>;
}

export default async function TachesPage({ searchParams }: TachesPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t, locale } = await getRequestTranslator();
  const tt = getTimeTranslator(locale);
  const { vue } = await searchParams;
  const timesheet = vue === "temps";

  const tabClass = (active: boolean) =>
    `inline-flex items-center rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? "border border-b-white border-slate-200 bg-white text-slate-900"
        : "text-brand-muted hover:text-slate-700"
    }`;

  const tabs = (
    <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
      <Link href="/taches" className={tabClass(!timesheet)}>
        {tt("timesheet.tabTasks")}
      </Link>
      <Link href="/taches?vue=temps" className={tabClass(timesheet)}>
        {tt("timesheet.tabTimesheet")}
      </Link>
    </div>
  );

  if (timesheet) {
    const myTasks = await listMyTimesheetTasks(user);
    return (
      <>
        <Header title={t("tasksPage.title")} subtitle={t("tasksPage.subtitle")} user={user} />
        <main className="p-8">
          {tabs}
          <WeeklyTimesheet tasks={myTasks} currentUserId={user.id} />
        </main>
      </>
    );
  }

  const projects = await listProjects();
  const portfolios = await listPortfolios(true);
  const projectLocale = new Map(
    projects.map((p) => [p.id, normalizeLocale(p.documentLocale)]),
  );
  const tasks = localizeTasks(await listTasks(), (id) => projectLocale.get(id) ?? "fr");
  const users = toAssigneeOptions(await listUsers());
  const canAssignByProjectId = buildProjectAssignmentAccess(
    user,
    projects,
    portfolios,
  );
  const timeIndex = await buildTaskTimeIndex(user, tasks);

  return (
    <>
      <Header
        title={t("tasksPage.title")}
        subtitle={t("tasksPage.subtitle")}
        user={user}
      />

      <main className="p-8">
        {tabs}
        {tasks.length === 0 ? (
          <EmptyState
            title={t("tasksPage.emptyTitle")}
            description={t("tasksPage.emptyDescription")}
          />
        ) : (
          <TasksTable
            tasks={tasks}
            projects={projects}
            users={users}
            canAssignByProjectId={canAssignByProjectId}
            timeByTask={timeIndex.timeByTask}
            canLogTaskIds={timeIndex.canLogTaskIds}
          />
        )}
      </main>
    </>
  );
}
