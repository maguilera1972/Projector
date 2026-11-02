import {
  getPortfolioById,
  getProjectById,
  getTaskById,
  getActivitiesByTaskId,
  listUsers,
} from "@/lib/db/store";
import {
  canUserAddActivities,
  canUserManageProjectTasks,
  canUserEditActivity,
  canUserWorkOnTask,
} from "@/lib/auth/task-assignment";
import { toAssigneeOptions } from "@/lib/users";
import type { SessionUser } from "@/lib/auth/permissions";
import type { Activity, HermesApproach, HermesPhaseId, Task } from "@/types";

export interface TaskAccessPermissions {
  canManage: boolean;
  canWork: boolean;
  canAddActivities: boolean;
  canEditTaskFields: boolean;
  canEditSchedule: boolean;
  canStartTask: boolean;
  canDeleteActivities: boolean;
  /** Titre / description (et phase / module pour une tâche manuelle). */
  canEditDefinition: boolean;
  canDeleteTask: boolean;
  canDuplicateTask: boolean;
}

export interface TaskProjectInfo {
  id: string;
  name: string;
  approach: HermesApproach;
  currentPhase: HermesPhaseId;
  startDate?: string;
  endDate?: string;
}

export interface TaskDetailContext {
  task: Task;
  activities: Activity[];
  users: ReturnType<typeof toAssigneeOptions>;
  permissions: TaskAccessPermissions;
  currentUserId: string;
  project: TaskProjectInfo;
}

export async function getTaskDetailContext(
  taskId: string,
  user: SessionUser,
): Promise<TaskDetailContext | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  const project = await getProjectById(task.projectId);
  if (!project) return null;

  const portfolio = project.portfolioId
    ? await getPortfolioById(project.portfolioId)
    : undefined;

  const activities = await getActivitiesByTaskId(taskId);
  const users = toAssigneeOptions(await listUsers());
  const canManage = canUserManageProjectTasks(user, project, portfolio);
  const canWork = canManage || canUserWorkOnTask(user, task, activities);
  const canAddActivities = canUserAddActivities(user, task, canManage);
  const isTaskAssignee = task.assigneeId === user.id;
  const canEditTaskFields =
    canManage || (canWork && isTaskAssignee && activities.length === 0);
  const canEditSchedule = canManage || isTaskAssignee;
  const canStartTask =
    canWork &&
    (canManage || isTaskAssignee) &&
    !task.startedAt &&
    task.status !== "termine";

  return {
    task,
    activities,
    users,
    currentUserId: user.id,
    project: {
      id: project.id,
      name: project.name,
      approach: project.approach,
      currentPhase: project.currentPhase,
      startDate: project.startDate,
      endDate: project.endDate,
    },
    permissions: {
      canManage,
      canWork,
      canAddActivities,
      canEditTaskFields,
      canEditSchedule,
      canStartTask,
      canDeleteActivities: canManage,
      canEditDefinition: canManage,
      canDeleteTask: canManage && task.source === "manual",
      canDuplicateTask: canManage,
    },
  };
}

export function canUserUpdateActivity(
  user: SessionUser,
  task: Task,
  activity: Activity,
  canManage: boolean,
): boolean {
  return canUserEditActivity(user, task, activity, canManage);
}
