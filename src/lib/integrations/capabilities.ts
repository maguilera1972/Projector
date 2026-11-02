import {
  getAppCredentials,
  getBotCredentials,
  getConnectorId,
  getCopilotApiAudiences,
  getDefaultMeetingOrganizer,
  getTeamsAppCatalogIdFromEnv,
  getTeamsAppId,
} from "./config";
import {
  BOT_FRAMEWORK_SCOPE,
  describeError,
  getAppToken,
  getAppTokenInfo,
  GraphError,
  graphRequest,
  type AppTokenInfo,
} from "./graph";
import type { IntegrationFeature, IntegrationSettings } from "@/types";
import { INTEGRATION_FEATURES } from "@/types";

/**
 * Exigence de permission : satisfaite par l'une des permissions d'application listées
 * (la première est la permission minimale recommandée, les suivantes sont équivalentes ou plus larges).
 */
type Requirement = readonly string[];

const GROUP_RW = ["Group.ReadWrite.All", "Directory.ReadWrite.All"] as const;

/** Permissions d'application Graph requises et recommandées par fonctionnalité. */
export const FEATURE_REQUIREMENTS: Record<
  IntegrationFeature,
  { required: Requirement[]; optional: Requirement[] }
> = {
  activityFeed: {
    required: [["TeamsActivity.Send"]],
    optional: [
      [
        "TeamsAppInstallation.ReadWriteSelfForUser.All",
        "TeamsAppInstallation.ReadWriteAndConsentSelfForUser.All",
        "TeamsAppInstallation.ReadWriteForUser.All",
        "TeamsAppInstallation.ReadWriteAndConsentForUser.All",
      ],
    ],
  },
  meetings: {
    required: [["Calendars.ReadWrite"]],
    optional: [],
  },
  workspaces: {
    required: [
      ["Team.Create", "Teamwork.Migrate.All", ...GROUP_RW],
      ["Channel.Create", "ChannelSettings.ReadWrite.All", ...GROUP_RW],
      ["TeamMember.ReadWrite.All", ...GROUP_RW],
      [
        "Team.ReadBasic.All",
        "TeamSettings.Read.All",
        "TeamSettings.ReadWrite.All",
        "Group.Read.All",
        "Directory.Read.All",
        ...GROUP_RW,
      ],
    ],
    optional: [["Channel.ReadBasic.All", "ChannelSettings.Read.All", "ChannelSettings.ReadWrite.All", ...GROUP_RW]],
  },
  tabs: {
    required: [
      ["TeamsTab.Create", "TeamsTab.ReadWriteSelfForTeam.All", "TeamsTab.ReadWriteForTeam.All", "TeamsTab.ReadWrite.All"],
      [
        "TeamsAppInstallation.ReadWriteForTeam.All",
        "TeamsAppInstallation.ReadWriteSelfForTeam.All",
        "TeamsAppInstallation.ReadWriteAndConsentForTeam.All",
        "TeamsAppInstallation.ReadWriteAndConsentSelfForTeam.All",
      ],
    ],
    optional: [],
  },
  sharepoint: {
    required: [["Sites.Selected", "Sites.ReadWrite.All", "Sites.Manage.All", "Sites.FullControl.All"]],
    optional: [],
  },
  bot: { required: [], optional: [] },
  proactive: { required: [], optional: [] },
  connector: {
    required: [
      ["ExternalConnection.ReadWrite.OwnedBy", "ExternalConnection.ReadWrite.All"],
      ["ExternalItem.ReadWrite.OwnedBy", "ExternalItem.ReadWrite.All"],
    ],
    optional: [],
  },
  copilotApi: { required: [], optional: [] },
};

export type FeatureBlockReason = "disabled" | "not_configured" | "missing_roles" | "bot_token" | "probe_failed";

export interface RequirementStatus {
  anyOf: string[];
  /** Permission du jeton qui satisfait l'exigence. */
  satisfiedBy?: string;
}

export interface ProbeResult {
  ok: boolean;
  /** Appel Graph réel (lecture seule) effectué pour confirmer la capacité. */
  call: string;
  detail?: string;
  checkedAt: string;
}

export interface FeatureCapability {
  feature: IntegrationFeature;
  enabled: boolean;
  available: boolean;
  usable: boolean;
  requirements: RequirementStatus[];
  /** Permission minimale recommandée de chaque exigence non satisfaite. */
  missingRoles: string[];
  missingOptionalRoles: string[];
  probe?: ProbeResult;
  reason?: FeatureBlockReason;
}

export interface CapabilityReport {
  configured: boolean;
  clientId?: string;
  tenantId?: string;
  tokenError?: string;
  roles: string[];
  token?: Omit<AppTokenInfo, "roles">;
  bot: { configured: boolean; tokenOk: boolean; appId?: string; error?: string };
  teamsAppId: string;
  teamsAppCatalogId?: string;
  meetingOrganizer?: string;
  copilotAudiences: string[];
  features: Record<IntegrationFeature, FeatureCapability>;
  checkedAt: string;
}

function evaluate(requirements: Requirement[], roles: string[]): RequirementStatus[] {
  return requirements.map((anyOf) => ({
    anyOf: [...anyOf],
    satisfiedBy: anyOf.find((role) => roles.includes(role)),
  }));
}

let botTokenCache: { ok: boolean; error?: string; at: number } | null = null;

async function checkBotToken(force: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!force && botTokenCache && Date.now() - botTokenCache.at < 600_000) return botTokenCache;
  try {
    await getAppToken(BOT_FRAMEWORK_SCOPE, getBotCredentials(), { forceRefresh: force });
    botTokenCache = { ok: true, at: Date.now() };
  } catch (error) {
    botTokenCache = { ok: false, error: describeError(error), at: Date.now() };
  }
  return botTokenCache;
}

async function probe(call: string, run: () => Promise<string | void>): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  try {
    const detail = await run();
    return { ok: true, call, detail: detail || undefined, checkedAt };
  } catch (error) {
    return { ok: false, call, detail: describeError(error), checkedAt };
  }
}

let probeCache: { results: Partial<Record<IntegrationFeature, ProbeResult>>; at: number } | null = null;

/** Appels Graph réels en lecture seule confirmant les capacités dont les permissions sont présentes. */
async function runProbes(
  usableByRoles: Set<IntegrationFeature>,
  force: boolean,
): Promise<Partial<Record<IntegrationFeature, ProbeResult>>> {
  if (!force && probeCache && Date.now() - probeCache.at < 10 * 60_000) return probeCache.results;
  const results: Partial<Record<IntegrationFeature, ProbeResult>> = {};
  const tasks: Promise<void>[] = [];
  let firstTeamId: string | undefined;

  const teamsProbe = usableByRoles.has("workspaces") || usableByRoles.has("tabs")
    ? probe("GET /teams?$top=1", async () => {
        const { data } = await graphRequest<{ value: { id: string }[] }>("GET", "/teams?$top=1&$select=id");
        firstTeamId = data.value[0]?.id;
        return data.value.length ? undefined : "aucune équipe";
      })
    : null;

  if (teamsProbe && usableByRoles.has("workspaces")) {
    tasks.push(teamsProbe.then((result) => void (results.workspaces = result)));
  }
  if (usableByRoles.has("tabs") && teamsProbe) {
    tasks.push(
      teamsProbe.then(async (teams) => {
        if (!teams.ok || !firstTeamId) {
          results.tabs = { ...teams, call: "GET /teams/{id}/installedApps", ok: teams.ok, detail: teams.detail ?? "aucune équipe à tester" };
          return;
        }
        results.tabs = await probe("GET /teams/{id}/installedApps", async () => {
          await graphRequest("GET", `/teams/${encodeURIComponent(firstTeamId!)}/installedApps`);
        });
      }),
    );
  }
  const organizer = getDefaultMeetingOrganizer();
  if (usableByRoles.has("meetings") && organizer) {
    tasks.push(
      probe(`GET /users/${organizer}/calendar`, async () => {
        await graphRequest("GET", `/users/${encodeURIComponent(organizer)}/calendar?$select=id`);
      }).then((result) => void (results.meetings = result)),
    );
  }
  if (usableByRoles.has("connector")) {
    tasks.push(
      probe(`GET /external/connections/${getConnectorId()}`, async () => {
        try {
          const { data } = await graphRequest<{ state?: string }>(
            "GET",
            `/external/connections/${encodeURIComponent(getConnectorId())}?$select=id,state`,
          );
          return `state: ${data.state ?? "?"}`;
        } catch (error) {
          if (error instanceof GraphError && error.status === 404) return "connexion non créée";
          throw error;
        }
      }).then((result) => void (results.connector = result)),
    );
  }
  await Promise.all(tasks);
  probeCache = { results, at: Date.now() };
  return results;
}

async function buildReport(
  settings: IntegrationSettings,
  force: boolean,
  withProbes: boolean,
): Promise<CapabilityReport> {
  const credentials = getAppCredentials();
  const botCredentials = getBotCredentials();
  let token: AppTokenInfo | undefined;
  let tokenError: string | undefined;
  if (credentials) {
    try {
      token = await getAppTokenInfo(force);
    } catch (error) {
      tokenError = describeError(error);
    }
  }
  const roles = token?.roles ?? [];
  const bot = botCredentials ? await checkBotToken(force) : { ok: false, error: "Bot non configuré." };

  const features = {} as Record<IntegrationFeature, FeatureCapability>;
  for (const feature of INTEGRATION_FEATURES) {
    const definition = FEATURE_REQUIREMENTS[feature];
    const requirements = evaluate(definition.required, roles);
    const missingRoles = requirements.filter((item) => !item.satisfiedBy).map((item) => item.anyOf[0]);
    const missingOptionalRoles = evaluate(definition.optional, roles)
      .filter((item) => !item.satisfiedBy)
      .map((item) => item.anyOf[0]);
    let reason: FeatureBlockReason | undefined;
    if (!credentials || tokenError) reason = "not_configured";
    else if (missingRoles.length > 0) reason = "missing_roles";
    else if ((feature === "bot" || feature === "proactive") && !bot.ok) reason = "bot_token";
    features[feature] = {
      feature,
      enabled: settings.features[feature],
      available: reason === undefined,
      usable: false,
      requirements,
      missingRoles,
      missingOptionalRoles,
      reason,
    };
  }

  if (withProbes && credentials && !tokenError) {
    const candidates = new Set(INTEGRATION_FEATURES.filter((feature) => features[feature].available));
    const probes = await runProbes(candidates, force);
    for (const [feature, result] of Object.entries(probes) as [IntegrationFeature, ProbeResult][]) {
      features[feature].probe = result;
      if (!result.ok) {
        features[feature].available = false;
        features[feature].reason = "probe_failed";
      }
    }
  }

  for (const feature of INTEGRATION_FEATURES) {
    const capability = features[feature];
    capability.usable = capability.available && capability.enabled;
    if (capability.available && !capability.enabled) capability.reason = "disabled";
  }

  const { roles: _roles, ...tokenMeta } = token ?? { roles: [] as string[] };
  return {
    configured: Boolean(credentials),
    clientId: credentials?.clientId,
    tenantId: credentials?.tenantId,
    tokenError,
    roles,
    token: token ? (tokenMeta as Omit<AppTokenInfo, "roles">) : undefined,
    bot: {
      configured: Boolean(botCredentials),
      tokenOk: bot.ok,
      appId: botCredentials?.clientId,
      error: bot.ok ? undefined : bot.error,
    },
    teamsAppId: getTeamsAppId(),
    teamsAppCatalogId: settings.teamsAppCatalogId ?? getTeamsAppCatalogIdFromEnv(),
    meetingOrganizer: getDefaultMeetingOrganizer(),
    copilotAudiences: getCopilotApiAudiences(),
    features,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Rapport de capacités. Si une permission semble absente d'un jeton réutilisé, un nouveau jeton est
 * demandé une fois (consentement administrateur accordé après l'émission du jeton en cache).
 * `force` : nouveau jeton, nouveaux appels de contrôle.
 */
export async function getCapabilityReport(
  settings: IntegrationSettings,
  options: { force?: boolean; probes?: boolean } = {},
): Promise<CapabilityReport> {
  const force = Boolean(options.force);
  const withProbes = options.probes ?? force;
  const report = await buildReport(settings, force, withProbes);
  if (force || report.tokenError) return report;
  const issuedAt = report.token?.issuedAt ? new Date(report.token.issuedAt).getTime() : 0;
  const somethingMissing = INTEGRATION_FEATURES.some((feature) => report.features[feature].reason === "missing_roles");
  if (somethingMissing && Date.now() - issuedAt > 2 * 60_000) {
    return buildReport(settings, true, withProbes);
  }
  return report;
}

export type FeatureCheck =
  | { ok: true }
  | { ok: false; reason: FeatureBlockReason; missingRoles: string[]; message: string };

/** Vérifie qu'une fonctionnalité est activée et que ses permissions sont consenties. */
export async function checkFeature(
  feature: IntegrationFeature,
  settings: IntegrationSettings,
): Promise<FeatureCheck> {
  const report = await getCapabilityReport(settings, { probes: false });
  const capability = report.features[feature];
  if (capability.usable) return { ok: true };
  const reason = capability.reason ?? "disabled";
  const messages: Record<FeatureBlockReason, string> = {
    disabled: "Fonctionnalité désactivée dans l'administration (Microsoft Teams & Copilot).",
    not_configured: `Microsoft Graph non configuré ou jeton refusé${report.tokenError ? ` : ${report.tokenError}` : ""}.`,
    missing_roles: `Permissions d'application manquantes (consentement administrateur requis) : ${capability.missingRoles.join(", ")}.`,
    bot_token: `Jeton Bot Framework indisponible${report.bot.error ? ` : ${report.bot.error}` : ""}.`,
    probe_failed: `Appel de contrôle Graph refusé${capability.probe?.detail ? ` : ${capability.probe.detail}` : ""}.`,
  };
  return { ok: false, reason, missingRoles: capability.missingRoles, message: messages[reason] };
}
