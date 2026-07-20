import type { SessionUser } from "@/lib/auth/permissions";
import type { Portfolio, Project } from "@/types";

type UserRef = Pick<SessionUser, "id" | "name" | "email">;

function matchesDesignatedPerson(user: UserRef, designated?: string): boolean {
  if (!designated?.trim()) return false;
  const value = designated.trim().toLowerCase();
  return (
    user.name.toLowerCase() === value || user.email.toLowerCase() === value
  );
}

/** Seul le chef de projet du projet ou le responsable du portfolio peut assigner. */
export function canUserAssignTasksOnProject(
  user: UserRef,
  project: Project,
  portfolio?: Portfolio | null,
): boolean {
  if (project.chefDeProjetId && project.chefDeProjetId === user.id) {
    return true;
  }

  if (matchesDesignatedPerson(user, project.chefDeProjet)) {
    return true;
  }

  if (portfolio) {
    if (portfolio.ownerId && portfolio.ownerId === user.id) {
      return true;
    }

    if (matchesDesignatedPerson(user, portfolio.owner)) {
      return true;
    }
  }

  return false;
}

export const canUserManageTasksOnProject = canUserAssignTasksOnProject;

export function canUserWorkOnTask(
  user: UserRef,
  task: { assigneeId?: string },
  activities: { assigneeId?: string }[],
): boolean {
  if (task.assigneeId === user.id) {
    return true;
  }

  return activities.some((activity) => activity.assigneeId === user.id);
}

export function canUserEditActivity(
  user: UserRef,
  task: { assigneeId?: string },
  activity: { assigneeId?: string },
  canManage: boolean,
): boolean {
  if (canManage) return true;
  if (task.assigneeId === user.id) return true;
  return activity.assigneeId === user.id;
}

export function canUserAddActivities(
  user: UserRef,
  task: { assigneeId?: string },
  canManage: boolean,
): boolean {
  return canManage || task.assigneeId === user.id;
}

export function buildProjectAssignmentAccess(
  user: UserRef,
  projects: Project[],
  portfolios: Portfolio[],
): Record<string, boolean> {
  const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));

  return Object.fromEntries(
    projects.map((project) => {
      const portfolio = project.portfolioId
        ? portfolioById.get(project.portfolioId)
        : undefined;

      return [
        project.id,
        canUserAssignTasksOnProject(user, project, portfolio),
      ];
    }),
  );
}
