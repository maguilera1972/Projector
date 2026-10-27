import {
  hasPermission,
  isUserActive,
  PERMISSIONS,
  toSessionUser,
  type SessionUser,
  type User,
} from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/hermes/project-roles";
import { getConnectorAdminGroupId } from "@/lib/integrations/config";
import { isProjectVisibleInReports } from "@/lib/reports/access";
import type { Activity, Portfolio, Project, Task } from "@/types";

/**
 * ACL des éléments du connecteur : reflet de la visibilité PROJECTOR (jamais « everyone »).
 * - visibility (défaut) : comptes liés à Entra qui voient le projet dans PROJECTOR
 *   (internes avec projects:read, invités liés au projet) ;
 * - linked (COPILOT_CONNECTOR_ACL_MODE=linked) : uniquement les personnes liées au projet + administrateurs.
 */

export type ConnectorAclMode = "visibility" | "linked";

export interface ExternalAclEntry {
  type: "user" | "group";
  value: string;
  accessType: "grant";
}

export function getConnectorAclMode(): ConnectorAclMode {
  return process.env.COPILOT_CONNECTOR_ACL_MODE?.trim().toLowerCase() === "linked" ? "linked" : "visibility";
}

interface AclPrincipal {
  oid: string;
  session: SessionUser;
}

export interface AclContext {
  mode: ConnectorAclMode;
  adminGroupId?: string;
  principals: AclPrincipal[];
  portfolioById: Map<string, Portfolio>;
  tasks: Task[];
  activities: Activity[];
}

export function createAclContext(
  users: User[],
  portfolios: Portfolio[],
  tasks: Task[],
  activities: Activity[],
): AclContext {
  const seen = new Set<string>();
  const principals: AclPrincipal[] = [];
  for (const user of users) {
    const oid = user.entraOid?.trim().toLowerCase();
    if (!oid || seen.has(oid) || !isUserActive(user) || user.pendingApproval) continue;
    seen.add(oid);
    principals.push({ oid, session: toSessionUser(user) });
  }
  return {
    mode: getConnectorAclMode(),
    adminGroupId: getConnectorAdminGroupId(),
    principals,
    portfolioById: new Map(portfolios.map((portfolio) => [portfolio.id, portfolio])),
    tasks,
    activities,
  };
}

function canSee(ctx: AclContext, user: SessionUser, project: Project): boolean {
  if (!hasPermission(user, PERMISSIONS.PROJECTS_READ)) return false;
  const portfolio = project.portfolioId ? ctx.portfolioById.get(project.portfolioId) : undefined;
  switch (ctx.mode) {
    case "visibility":
      return isProjectVisibleInReports(user, project, portfolio, ctx.tasks, ctx.activities);
    case "linked":
      // La règle « invité » de isProjectVisibleInReports ne retient que les liens directs au projet.
      return (
        isPlatformAdmin(user) ||
        isProjectVisibleInReports({ ...user, role: "guest" }, project, portfolio, ctx.tasks, ctx.activities)
      );
    default: {
      const exhaustive: never = ctx.mode;
      return exhaustive;
    }
  }
}

/** ACL triée (empreinte stable) ; vide si personne n'est autorisé et qu'aucun groupe de repli n'existe. */
export function projectAcl(ctx: AclContext, project: Project): ExternalAclEntry[] {
  const entries: ExternalAclEntry[] = ctx.principals
    .filter((principal) => canSee(ctx, principal.session, project))
    .map((principal) => ({ type: "user", value: principal.oid, accessType: "grant" }));
  entries.sort((a, b) => a.value.localeCompare(b.value));
  if (ctx.adminGroupId) entries.push({ type: "group", value: ctx.adminGroupId, accessType: "grant" });
  return entries;
}
