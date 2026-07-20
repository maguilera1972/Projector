import type { DashboardStats, TaskStatus } from "@/types";
import { listProjects, listTasks, listActivities, getPendingPvDocumentsForUser } from "@/lib/db/store";
import { getDaysOverdue, isOverdue } from "@/lib/tasks/dates";

export interface UserOverdueItem {
  kind: "task" | "activity";
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  projectId: string;
  projectName: string;
  taskId: string;
  parentTaskTitle?: string;
  daysOverdue: number;
}

export async function getUserOverdueItems(
  userId: string,
): Promise<UserOverdueItem[]> {
  const [projects, tasks, activities] = await Promise.all([
    listProjects(),
    listTasks(),
    listActivities(),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const items: UserOverdueItem[] = [];

  for (const task of tasks) {
    if (task.assigneeId !== userId) continue;
    if (!isOverdue(task.dueDate, task.status)) continue;

    const project = projectById.get(task.projectId);
    items.push({
      kind: "task",
      id: task.id,
      title: task.title,
      dueDate: task.dueDate!,
      status: task.status,
      projectId: task.projectId,
      projectName: project?.name ?? "Projet inconnu",
      taskId: task.id,
      daysOverdue: getDaysOverdue(task.dueDate!),
    });
  }

  for (const activity of activities) {
    if (activity.assigneeId !== userId) continue;
    if (!isOverdue(activity.dueDate, activity.status)) continue;

    const task = taskById.get(activity.taskId);
    if (!task) continue;

    const project = projectById.get(task.projectId);
    items.push({
      kind: "activity",
      id: activity.id,
      title: activity.title,
      dueDate: activity.dueDate!,
      status: activity.status,
      projectId: task.projectId,
      projectName: project?.name ?? "Projet inconnu",
      taskId: task.id,
      parentTaskTitle: task.title,
      daysOverdue: getDaysOverdue(activity.dueDate!),
    });
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function getDashboardStats(
  userId?: string,
): Promise<DashboardStats> {
  const projects = await listProjects();
  const tasks = await listTasks();

  const activeProjects = projects.filter(
    (p) => p.status === "en_cours" || p.status === "planifie",
  ).length;

  const completedTasks = tasks.filter((t) => t.status === "termine").length;
  const pendingTasks = tasks.filter(
    (t) => t.status === "a_faire" || t.status === "en_cours",
  ).length;

  const now = new Date();
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = tasks.filter((t) => {
    if (!t.dueDate || t.status === "termine") return false;
    const due = new Date(t.dueDate);
    return due >= now && due <= inTwoWeeks;
  }).length;

  const myOverdueTasks = userId
    ? (await getUserOverdueItems(userId)).length
    : 0;

  const pendingPvDocuments = userId
    ? (await getPendingPvDocumentsForUser(userId)).length
    : 0;

  return {
    totalProjects: projects.length,
    activeProjects,
    completedTasks,
    pendingTasks,
    upcomingDeadlines,
    myOverdueTasks,
    pendingPvDocuments,
  };
}

export async function getAverageProgress(): Promise<number> {
  const projects = await listProjects();
  if (projects.length === 0) return 0;
  const total = projects.reduce((sum, p) => sum + p.progress, 0);
  return Math.round(total / projects.length);
}
