import type { SessionUser } from "@/lib/auth/permissions";
import { canUserAssignTasksOnProject, canUserWorkOnTask } from "@/lib/auth/task-assignment";
import { isPlatformAdmin } from "@/lib/hermes/project-roles";
import type { Activity, Portfolio, Project, Task, TimeEntry } from "@/types";

/**
 * Droits de saisie du temps sur une tâche :
 * - chef de projet / responsable du portfolio / administrateur : saisit et corrige pour tout le monde ;
 * - personne assignée (tâche ou activité) : saisit son propre temps ;
 * - l'auteur d'une saisie peut toujours la corriger ou la supprimer (aucun verrouillage).
 */
export interface TimeAccess {
  canManage: boolean;
  canLogOwn: boolean;
}

export function isTimeManager(
  user: SessionUser,
  project: Project,
  portfolio?: Portfolio | null,
): boolean {
  return isPlatformAdmin(user) || canUserAssignTasksOnProject(user, project, portfolio);
}

export function getTimeAccess(
  user: SessionUser,
  project: Project,
  portfolio: Portfolio | null | undefined,
  task: Task,
  activities: Activity[],
): TimeAccess {
  const canManage = isTimeManager(user, project, portfolio);
  return {
    canManage,
    canLogOwn: canManage || canUserWorkOnTask(user, task, activities),
  };
}

export function canLogTimeFor(access: TimeAccess, user: SessionUser, targetUserId: string): boolean {
  return targetUserId === user.id ? access.canLogOwn : access.canManage;
}

export function isOwnEntry(user: SessionUser, entry: Pick<TimeEntry, "userId" | "createdBy">): boolean {
  return entry.userId === user.id || entry.createdBy === user.id;
}

/** Corriger / supprimer : toujours possible pour l'auteur, et pour les gestionnaires du projet. */
export function canModifyTimeEntry(
  user: SessionUser,
  entry: Pick<TimeEntry, "userId" | "createdBy">,
  canManageProject: boolean,
): boolean {
  return canManageProject || isOwnEntry(user, entry);
}
