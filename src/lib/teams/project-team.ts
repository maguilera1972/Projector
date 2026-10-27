import { isUserActive, type User } from "@/lib/auth/permissions";
import { listPortfolios, listUsers } from "@/lib/db/store";
import { listReportRecipients } from "@/lib/reports/access";
import type { Project, ProjectTeamsMemberSync } from "@/types";

export type ProjectTeamRole =
  | "chef"
  | "mandant"
  | "portfolioOwner"
  | "assignee"
  | "activityAssignee"
  | "team";

export interface ProjectTeamMember {
  user: User;
  roles: ProjectTeamRole[];
}

/** Équipe PROJECTOR d'un projet : chef, mandant, propriétaire de portfolio, ressources, assignés. */
export async function resolveProjectTeam(project: Project): Promise<ProjectTeamMember[]> {
  const [portfolios, users] = await Promise.all([listPortfolios(true), listUsers()]);
  const recipients = await listReportRecipients([project], portfolios);
  const byId = new Map(users.map((user) => [user.id, user]));
  return recipients
    .map((recipient) => ({ user: byId.get(recipient.userId), roles: recipient.roles }))
    .filter((item): item is ProjectTeamMember => Boolean(item.user && isUserActive(item.user)));
}

/** Décideurs d'un quality gate : mandant, chef de projet, propriétaire du portfolio. */
export function decisionMakers(team: ProjectTeamMember[]): ProjectTeamMember[] {
  return team.filter((member) =>
    member.roles.some((role) => role === "mandant" || role === "chef" || role === "portfolioOwner"),
  );
}

export type SkippedMember = ProjectTeamsMemberSync["skipped"][number];

/** Sépare les membres synchronisables dans Teams (comptes Entra internes) des autres. */
export function partitionForTeams(team: ProjectTeamMember[]): {
  eligible: ProjectTeamMember[];
  skipped: SkippedMember[];
} {
  const eligible: ProjectTeamMember[] = [];
  const skipped: SkippedMember[] = [];
  for (const member of team) {
    if (member.user.role === "guest") {
      skipped.push({ userId: member.user.id, name: member.user.name, reason: "guest" });
    } else if (!member.user.entraOid) {
      skipped.push({ userId: member.user.id, name: member.user.name, reason: "no_entra" });
    } else {
      eligible.push(member);
    }
  }
  return { eligible, skipped };
}
