import type { Project } from "@/types";

export interface UserProjectLink {
  projectId: string;
  projectName: string;
  role: string;
}

export function isActiveProject(project: Pick<Project, "status">): boolean {
  return project.status !== "termine";
}

export function findUserActiveProjectLinks(
  userId: string,
  projects: Project[],
  tasks: { id: string; projectId: string; assigneeId?: string }[],
  activities: { taskId: string; assigneeId?: string }[],
): UserProjectLink[] {
  const activeProjects = projects.filter(isActiveProject);
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const links: UserProjectLink[] = [];
  const seen = new Set<string>();

  function addLink(project: Project, role: string) {
    const key = `${project.id}:${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      projectId: project.id,
      projectName: project.name,
      role,
    });
  }

  for (const project of activeProjects) {
    if (project.mandantUserId === userId) {
      addLink(project, "Mandant");
    }
    if (project.chefDeProjetId === userId) {
      addLink(project, "Chef de projet");
    }
  }

  const taskProjectById = new Map(
    tasks.map((task) => [task.id, task.projectId]),
  );

  for (const task of tasks) {
    if (
      task.assigneeId === userId &&
      activeProjectIds.has(task.projectId)
    ) {
      const project = activeProjects.find((item) => item.id === task.projectId);
      if (project) addLink(project, "Assigné tâche");
    }
  }

  for (const activity of activities) {
    if (!activity.assigneeId || activity.assigneeId !== userId) continue;
    const projectId = taskProjectById.get(activity.taskId);
    if (!projectId || !activeProjectIds.has(projectId)) continue;
    const project = activeProjects.find((item) => item.id === projectId);
    if (project) addLink(project, "Assigné activité");
  }

  return links.sort((a, b) =>
    a.projectName.localeCompare(b.projectName, "fr"),
  );
}
