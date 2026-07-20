import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TasksTable } from "@/components/task/tasks-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listPortfolios, listProjects, listTasks, listUsers } from "@/lib/db/store";
import { getSessionUser } from "@/lib/auth/session";
import { buildProjectAssignmentAccess } from "@/lib/auth/task-assignment";
import { toAssigneeOptions } from "@/lib/users";

export default async function TachesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const projects = await listProjects();
  const portfolios = await listPortfolios(true);
  const tasks = await listTasks();
  const users = toAssigneeOptions(await listUsers());
  const canAssignByProjectId = buildProjectAssignmentAccess(
    user,
    projects,
    portfolios,
  );

  return (
    <>
      <Header
        title="Tâches"
        subtitle="Suivi des tâches par module et phase HERMES5"
        user={user}
      />

      <main className="p-8">
        {tasks.length === 0 ? (
          <EmptyState
            title="Aucune tâche"
            description="Les tâches apparaîtront ici une fois que vous aurez créé des projets avec un scénario HERMES5."
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
