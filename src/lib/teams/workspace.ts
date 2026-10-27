import type { SessionUser, User } from "@/lib/auth/permissions";
import { getPhasesForApproach } from "@/lib/hermes/phases";
import { getTranslator, tDynamic } from "@/lib/i18n/translate";
import { normalizeLocale } from "@/lib/i18n/config";
import { absoluteUrl, getTeamsAppCatalogIdFromEnv } from "@/lib/integrations/config";
import { checkFeature } from "@/lib/integrations/capabilities";
import { describeError, GraphError, graphRequest } from "@/lib/integrations/graph";
import type {
  HermesPhaseId,
  IntegrationSettings,
  Project,
  ProjectTeamsChannel,
  ProjectTeamsMemberSync,
  ProjectTeamsWorkspace,
} from "@/types";
import { partitionForTeams, resolveProjectTeam, type ProjectTeamMember } from "./project-team";

/**
 * Lot 2 — Espace Teams par projet : équipe dédiée (un canal par phase HERMES) ou canal(aux) dans une
 * équipe existante, synchronisation des membres (comptes Entra internes uniquement) et onglets PROJECTOR
 * (si TeamsTab.Create + TeamsAppInstallation.ReadWriteForTeam.All sont consentis).
 */

export interface ProvisionOptions {
  mode: "team" | "channel";
  /** Équipe existante (mode canal). */
  teamId?: string;
  /** Un canal par phase (toujours en mode équipe ; optionnel en mode canal). */
  phaseChannels?: boolean;
  dryRun?: boolean;
}

export interface WorkspacePlan {
  mode: "team" | "channel";
  teamName: string;
  teamId?: string;
  owner?: { userId: string; name: string };
  channels: { phase?: HermesPhaseId; displayName: string }[];
  members: { userId: string; name: string; owner: boolean }[];
  skipped: ProjectTeamsMemberSync["skipped"];
  tabs: { possible: boolean; reason?: string };
  warnings: string[];
}

const CHANNEL_FORBIDDEN = /[~#%&*{}+/\\:<>?|'"]/g;

function sanitizeName(value: string, max = 50): string {
  const cleaned = value.replace(CHANNEL_FORBIDDEN, " ").replace(/\s+/g, " ").replace(/^[_.\s]+|[.\s]+$/g, "").trim();
  return (cleaned || "PROJECTOR").slice(0, max).trim();
}

function phaseLabel(project: Project, phase: HermesPhaseId): string {
  const t = getTranslator(normalizeLocale(project.documentLocale));
  return tDynamic(t, `enums.phase.${phase}`);
}

function plannedChannels(project: Project, options: ProvisionOptions): WorkspacePlan["channels"] {
  const phases = getPhasesForApproach(project.approach);
  if (options.mode === "team") {
    return phases.map((phase) => ({
      phase: phase.id,
      displayName: sanitizeName(`${phase.order}. ${phaseLabel(project, phase.id)}`),
    }));
  }
  const base = sanitizeName(project.name, 30);
  const primary = [{ displayName: sanitizeName(project.name) }];
  if (!options.phaseChannels) return primary;
  return [
    ...primary,
    ...phases.map((phase) => ({
      phase: phase.id,
      displayName: sanitizeName(`${base} · ${phaseLabel(project, phase.id)}`),
    })),
  ];
}

function pickOwner(
  project: Project,
  eligible: ProjectTeamMember[],
  actor: SessionUser & Pick<User, "entraOid">,
): ProjectTeamMember | { user: Pick<User, "id" | "name" | "entraOid"> } | undefined {
  const chef = eligible.find((member) => member.roles.includes("chef"));
  if (chef) return chef;
  if (actor.entraOid) return { user: { id: actor.id, name: actor.name, entraOid: actor.entraOid } };
  return eligible.find((member) => member.user.id === project.chefDeProjetId) ?? eligible[0];
}

async function tabsCapability(settings: IntegrationSettings): Promise<{ possible: boolean; reason?: string }> {
  const check = await checkFeature("tabs", settings);
  if (!check.ok) return { possible: false, reason: check.message };
  if (!settings.teamsAppCatalogId && !getTeamsAppCatalogIdFromEnv()) {
    return {
      possible: false,
      reason: "ID de catalogue de l'application Teams inconnu : importez l'app dans le centre d'administration Teams puis renseignez-le.",
    };
  }
  return { possible: true };
}

export async function planWorkspace(
  project: Project,
  options: ProvisionOptions,
  actor: SessionUser & Pick<User, "entraOid">,
  settings: IntegrationSettings,
): Promise<WorkspacePlan> {
  const team = await resolveProjectTeam(project);
  const { eligible, skipped } = partitionForTeams(team);
  const owner = options.mode === "team" ? pickOwner(project, eligible, actor) : undefined;
  const warnings: string[] = [];
  if (options.mode === "team" && !owner) {
    warnings.push("Aucun propriétaire possible : le chef de projet doit être lié à un compte Microsoft Entra.");
  }
  if (options.mode === "channel" && !options.teamId) warnings.push("Équipe Teams existante non choisie.");
  if (skipped.length > 0) {
    warnings.push(`${skipped.length} membre(s) non synchronisé(s) (invité externe ou compte non lié à Entra).`);
  }
  return {
    mode: options.mode,
    teamName: sanitizeName(`PROJECTOR · ${project.name}`, 256),
    teamId: options.teamId,
    owner: owner ? { userId: owner.user.id, name: owner.user.name } : undefined,
    channels: plannedChannels(project, options),
    members: eligible.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      owner: member.roles.includes("chef"),
    })),
    skipped,
    tabs: await tabsCapability(settings),
    warnings,
  };
}

function userBind(oid: string): string {
  return `https://graph.microsoft.com/v1.0/users('${oid}')`;
}

interface GraphChannel {
  id: string;
  displayName: string;
  webUrl?: string;
}

async function waitForTeam(teamId: string, operationUrl?: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 3000 : 5000));
    if (operationUrl) {
      try {
        const { data } = await graphRequest<{ status?: string; error?: { message?: string } }>(
          "GET",
          operationUrl,
        );
        if (data.status === "succeeded") return;
        if (data.status === "failed") throw new Error(`Création de l'équipe échouée : ${data.error?.message ?? ""}`);
        continue;
      } catch (error) {
        if (!(error instanceof GraphError)) throw error;
      }
    }
    try {
      await graphRequest("GET", `/teams/${encodeURIComponent(teamId)}?$select=id`);
      return;
    } catch (error) {
      if (!(error instanceof GraphError) || (error.status !== 404 && error.status !== 403)) throw error;
    }
  }
  throw new Error("L'équipe Teams n'est pas encore disponible (création asynchrone) : réessayez dans quelques minutes.");
}

async function createTeam(project: Project, plan: WorkspacePlan, ownerOid: string): Promise<string> {
  const response = await graphRequest("POST", "/teams", {
    body: {
      "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
      displayName: plan.teamName,
      description: `Espace Teams du projet HERMES « ${project.name} » (PROJECTOR) — ${absoluteUrl(`/projets/${project.id}`)}`.slice(0, 1024),
      visibility: "private",
      members: [
        {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: ["owner"],
          "user@odata.bind": userBind(ownerOid),
        },
      ],
    },
  });
  const location = response.headers.get("Location") ?? response.headers.get("Content-Location") ?? "";
  const teamId = /teams\('([^']+)'\)/i.exec(location)?.[1];
  if (!teamId) throw new Error("Identifiant de l'équipe absent de la réponse Graph.");
  const operationUrl = /operations\('/i.test(location)
    ? `https://graph.microsoft.com/v1.0${location.startsWith("/") ? "" : "/"}${location}`
    : undefined;
  await waitForTeam(teamId, operationUrl);
  return teamId;
}

async function listChannels(teamId: string): Promise<GraphChannel[]> {
  const { data } = await graphRequest<{ value: GraphChannel[] }>(
    "GET",
    `/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,webUrl`,
  );
  return data.value;
}

async function ensureChannel(
  teamId: string,
  displayName: string,
  description: string,
  existing: GraphChannel[],
): Promise<GraphChannel> {
  const found = existing.find((channel) => channel.displayName.toLowerCase() === displayName.toLowerCase());
  if (found) return found;
  const { data } = await graphRequest<GraphChannel>("POST", `/teams/${encodeURIComponent(teamId)}/channels`, {
    body: { displayName, description: description.slice(0, 1024), membershipType: "standard" },
  });
  return data;
}

/** Ajoute les membres manquants (ajout groupé Graph `members/add`). */
export async function syncTeamMembers(
  project: Project,
  teamId: string,
): Promise<ProjectTeamsMemberSync> {
  const team = await resolveProjectTeam(project);
  const { eligible, skipped } = partitionForTeams(team);
  const { data } = await graphRequest<{ value: { userId?: string }[] }>(
    "GET",
    `/teams/${encodeURIComponent(teamId)}/members`,
  );
  const present = new Set(data.value.map((member) => member.userId?.toLowerCase()).filter(Boolean));
  const toAdd = eligible.filter((member) => !present.has(member.user.entraOid!.toLowerCase()));
  const alreadyMembers = eligible.filter((member) => present.has(member.user.entraOid!.toLowerCase()));
  const added: string[] = [];
  const failed = [...skipped];

  for (let index = 0; index < toAdd.length; index += 20) {
    const batch = toAdd.slice(index, index + 20);
    try {
      const { data: result } = await graphRequest<{
        value: { userId?: string; error?: { message?: string } | null }[];
      }>("POST", `/teams/${encodeURIComponent(teamId)}/members/add`, {
        body: {
          values: batch.map((member) => ({
            "@odata.type": "microsoft.graph.aadUserConversationMember",
            roles: member.roles.includes("chef") ? ["owner"] : [],
            "user@odata.bind": userBind(member.user.entraOid!),
          })),
        },
      });
      for (const member of batch) {
        const entry = result.value.find((item) => item.userId?.toLowerCase() === member.user.entraOid!.toLowerCase());
        if (entry?.error) {
          failed.push({ userId: member.user.id, name: member.user.name, reason: "error", detail: entry.error.message });
        } else {
          added.push(member.user.name);
        }
      }
    } catch (error) {
      for (const member of batch) {
        failed.push({ userId: member.user.id, name: member.user.name, reason: "error", detail: describeError(error) });
      }
    }
  }

  return {
    at: new Date().toISOString(),
    added,
    alreadyMembers: alreadyMembers.map((member) => member.user.name),
    skipped: failed,
  };
}

/** Installe l'app dans l'équipe et ajoute un onglet PROJECTOR par canal (capacité « tabs »). */
async function installTabs(
  project: Project,
  teamId: string,
  channels: ProjectTeamsChannel[],
  settings: IntegrationSettings,
): Promise<string[]> {
  const warnings: string[] = [];
  const capability = await tabsCapability(settings);
  if (!capability.possible) return [`Onglets PROJECTOR non créés : ${capability.reason}`];
  const catalogId = settings.teamsAppCatalogId ?? getTeamsAppCatalogIdFromEnv()!;
  const appBind = `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogId}`;
  try {
    await graphRequest("POST", `/teams/${encodeURIComponent(teamId)}/installedApps`, {
      body: { "teamsApp@odata.bind": appBind },
    });
  } catch (error) {
    if (!(error instanceof GraphError && error.status === 409)) {
      return [`Installation de l'app Teams dans l'équipe impossible : ${describeError(error)}`];
    }
  }
  for (const channel of channels) {
    const scope = channel.phase ?? "general";
    const query = channel.phase ? `?phase=${channel.phase}` : "";
    try {
      const { data } = await graphRequest<{ id: string }>(
        "POST",
        `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channel.channelId)}/tabs`,
        {
          body: {
            displayName: "PROJECTOR",
            "teamsApp@odata.bind": appBind,
            configuration: {
              entityId: `projector-project-${project.id}-${scope}`,
              contentUrl: absoluteUrl(`/teams/project/${project.id}${query}`),
              websiteUrl: absoluteUrl(`/projets/${project.id}`),
            },
          },
        },
      );
      channel.tabId = data.id;
    } catch (error) {
      warnings.push(`Onglet non créé dans « ${channel.displayName} » : ${describeError(error)}`);
    }
  }
  return warnings;
}

/** Crée l'espace Teams du projet (ou renvoie le plan en mode simulation). */
export async function provisionWorkspace(
  project: Project,
  options: ProvisionOptions,
  actor: SessionUser & Pick<User, "entraOid">,
  settings: IntegrationSettings,
): Promise<{ plan: WorkspacePlan; workspace?: ProjectTeamsWorkspace }> {
  const plan = await planWorkspace(project, options, actor, settings);
  if (options.dryRun) return { plan };

  const check = await checkFeature("workspaces", settings);
  if (!check.ok) throw new Error(check.message);
  if (project.teams) throw new Error("Ce projet possède déjà un espace Teams.");

  const warnings: string[] = [];
  let teamId: string;
  let teamName: string | undefined;
  if (options.mode === "team") {
    const team = await resolveProjectTeam(project);
    const owner = pickOwner(project, partitionForTeams(team).eligible, actor);
    if (!owner?.user.entraOid) {
      throw new Error("Le chef de projet (ou vous-même) doit être lié à Microsoft Entra pour devenir propriétaire de l'équipe.");
    }
    teamId = await createTeam(project, plan, owner.user.entraOid);
    teamName = plan.teamName;
  } else {
    if (!options.teamId) throw new Error("Choisissez une équipe Teams existante.");
    teamId = options.teamId;
    const { data } = await graphRequest<{ displayName?: string }>(
      "GET",
      `/teams/${encodeURIComponent(teamId)}?$select=displayName`,
    );
    teamName = data.displayName;
  }

  const existing = await listChannels(teamId);
  const channels: ProjectTeamsChannel[] = [];
  for (const planned of plan.channels) {
    try {
      const channel = await ensureChannel(
        teamId,
        planned.displayName,
        `${project.name}${planned.phase ? ` — ${phaseLabel(project, planned.phase)}` : ""} (PROJECTOR)`,
        existing,
      );
      channels.push({
        phase: planned.phase,
        channelId: channel.id,
        displayName: channel.displayName,
        webUrl: channel.webUrl,
      });
    } catch (error) {
      warnings.push(`Canal « ${planned.displayName} » non créé : ${describeError(error)}`);
    }
  }

  const general = existing.find((channel) => channel.displayName.toLowerCase() === "general");
  if (options.mode === "team" && general) {
    channels.unshift({ channelId: general.id, displayName: general.displayName, webUrl: general.webUrl });
  }
  const primary = channels.find((channel) => !channel.phase) ?? channels[0];

  let lastMemberSync: ProjectTeamsMemberSync | undefined;
  try {
    lastMemberSync = await syncTeamMembers(project, teamId);
  } catch (error) {
    warnings.push(`Synchronisation des membres impossible : ${describeError(error)}`);
  }

  if (settings.features.tabs) {
    warnings.push(...(await installTabs(project, teamId, channels, settings)));
  }

  const workspace: ProjectTeamsWorkspace = {
    mode: options.mode,
    teamId,
    teamName,
    teamWebUrl: primary?.webUrl,
    primaryChannelId: primary?.channelId ?? channels[0]?.channelId,
    channels,
    status: warnings.length === 0 ? "ready" : channels.length > 0 ? "partial" : "failed",
    warnings,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    lastMemberSync,
  };
  return { plan, workspace };
}

/** Équipes Teams existantes (choix du mode « canal dans une équipe existante »). */
export async function listExistingTeams(): Promise<{ id: string; displayName: string; description?: string }[]> {
  const { data } = await graphRequest<{ value: { id: string; displayName: string; description?: string }[] }>(
    "GET",
    "/teams?$select=id,displayName,description&$top=999",
  );
  return data.value.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
}
