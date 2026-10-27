import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TasksTable } from "@/components/task/tasks-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listPortfolios, listProjects, listTasks, listUsers } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { buildProjectAssignmentAccess } from "@/lib/auth/task-assignment";
import { toAssigneeOptions } from "@/lib/users";
import { localizeTasks } from "@/lib/hermes/i18n";
import { normalizeLocale } from "@/lib/i18n/config";
import { getRequestTranslator } from "@/lib/i18n/server";

export default async function TachesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { t } = await getRequestTranslator();

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

  return (
    <>
      <Header
        title={t("tasksPage.title")}
        subtitle={t("tasksPage.subtitle")}
        user={user}
      />

      <main className="p-8">
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
          />
        )}
      </main>
    </>
  );
}
