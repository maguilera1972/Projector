import type { Portfolio, Project } from "@/types";
import type { SessionUser } from "@/lib/auth/permissions";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

type UserRef = Pick<SessionUser, "id" | "name" | "email">;

function matchesDesignatedPerson(user: UserRef, designated?: string): boolean {
  if (!designated?.trim()) return false;
  const value = designated.trim().toLowerCase();
  return (
    user.name.toLowerCase() === value || user.email.toLowerCase() === value
  );
}

export function canUserActAsMandant(user: UserRef, project: Project): boolean {
  if (project.mandantUserId && project.mandantUserId === user.id) {
    return true;
  }
  return matchesDesignatedPerson(user, project.mandant);
}

export function canUserActAsChefDeProjet(
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
  if (portfolio?.ownerId === user.id) {
    return true;
  }
  if (matchesDesignatedPerson(user, portfolio?.owner)) {
    return true;
  }
  return false;
}

export function isPlatformAdmin(
  user: Pick<SessionUser, "role" | "permissions">,
): boolean {
  return (
    user.role === "admin" || hasPermission(user, PERMISSIONS.ADMIN_ACCESS)
  );
}

export function canUserManageProjectMandant(
  user: UserRef & Pick<SessionUser, "role" | "permissions">,
  project: Project,
  portfolio?: Portfolio | null,
): boolean {
  if (isPlatformAdmin(user)) {
    return true;
  }
  return canUserActAsChefDeProjet(user, project, portfolio);
}

export function canUserEditProjectDocuments(
  user: UserRef & Pick<SessionUser, "role" | "permissions">,
  project: Project,
  portfolio?: Portfolio | null,
): boolean {
  if (isPlatformAdmin(user)) {
    return true;
  }
  return canUserActAsChefDeProjet(user, project, portfolio);
}
