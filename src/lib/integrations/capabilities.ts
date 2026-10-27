import {
  getAppCredentials,
  getBotCredentials,
  getCopilotApiAudiences,
  getDefaultMeetingOrganizer,
  getTeamsAppCatalogIdFromEnv,
  getTeamsAppId,
} from "./config";
import { BOT_FRAMEWORK_SCOPE, describeError, getAppToken, getAppTokenRoles } from "./graph";
import type { IntegrationFeature, IntegrationSettings } from "@/types";
import { INTEGRATION_FEATURES } from "@/types";

/** Permissions d'application Graph requises (toutes) et recommandées par fonctionnalité. */
export const FEATURE_ROLES: Record<IntegrationFeature, { required: string[]; optional: string[] }> = {
  activityFeed: {
    required: ["TeamsActivity.Send"],
    optional: ["TeamsAppInstallation.ReadWriteSelfForUser.All"],
  },
  meetings: { required: ["Calendars.ReadWrite"], optional: ["OnlineMeetings.ReadWrite.All"] },
  workspaces: {
    required: ["Team.Create", "Channel.Create", "TeamMember.ReadWrite.All", "Team.ReadBasic.All"],
    optional: ["Channel.ReadBasic.All"],
  },
  tabs: { required: ["TeamsTab.Create", "TeamsAppInstallation.ReadWriteForTeam.All"], optional: [] },
  sharepoint: { required: ["Sites.Selected"], optional: [] },
  bot: { required: [], optional: [] },
  proactive: { required: [], optional: [] },
  connector: {
    required: ["ExternalConnection.ReadWrite.OwnedBy", "ExternalItem.ReadWrite.OwnedBy"],
    optional: [],
  },
  copilotApi: { required: [], optional: [] },
};

export type FeatureBlockReason = "disabled" | "not_configured" | "missing_roles" | "bot_token";

export interface FeatureCapability {
  feature: IntegrationFeature;
  enabled: boolean;
  available: boolean;
  usable: boolean;
  missingRoles: string[];
  missingOptionalRoles: string[];
  reason?: FeatureBlockReason;
}

export interface CapabilityReport {
  configured: boolean;
  clientId?: string;
  tenantId?: string;
  tokenError?: string;
  roles: string[];
  bot: { configured: boolean; tokenOk: boolean; appId?: string; error?: string };
  teamsAppId: string;
  teamsAppCatalogId?: string;
  meetingOrganizer?: string;
  copilotAudiences: string[];
  features: Record<IntegrationFeature, FeatureCapability>;
  checkedAt: string;
}

let botTokenCache: { ok: boolean; error?: string; at: number } | null = null;

async function checkBotToken(force: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!force && botTokenCache && Date.now() - botTokenCache.at < 600_000) return botTokenCache;
  try {
    await getAppToken(BOT_FRAMEWORK_SCOPE, getBotCredentials());
    botTokenCache = { ok: true, at: Date.now() };
  } catch (error) {
    botTokenCache = { ok: false, error: describeError(error), at: Date.now() };
  }
  return botTokenCache;
}

export async function getCapabilityReport(
  settings: IntegrationSettings,
  options: { force?: boolean } = {},
): Promise<CapabilityReport> {
  const credentials = getAppCredentials();
  const botCredentials = getBotCredentials();
  let roles: string[] = [];
  let tokenError: string | undefined;
  if (credentials) {
    try {
      roles = await getAppTokenRoles(options.force);
    } catch (error) {
      tokenError = describeError(error);
    }
  }
  const bot = botCredentials
    ? await checkBotToken(Boolean(options.force))
    : { ok: false, error: "Bot non configuré." };

  const features = {} as Record<IntegrationFeature, FeatureCapability>;
  for (const feature of INTEGRATION_FEATURES) {
    const { required, optional } = FEATURE_ROLES[feature];
    const missingRoles = required.filter((role) => !roles.includes(role));
    const missingOptionalRoles = optional.filter((role) => !roles.includes(role));
    const enabled = settings.features[feature];
    let reason: FeatureBlockReason | undefined;
    if (!credentials || tokenError) reason = "not_configured";
    else if (missingRoles.length > 0) reason = "missing_roles";
    else if ((feature === "bot" || feature === "proactive") && !bot.ok) reason = "bot_token";
    const available = reason === undefined;
    if (available && !enabled) reason = "disabled";
    features[feature] = {
      feature,
      enabled,
      available,
      usable: available && enabled,
      missingRoles,
      missingOptionalRoles,
      reason,
    };
  }

  return {
    configured: Boolean(credentials),
    clientId: credentials?.clientId,
    tenantId: credentials?.tenantId,
    tokenError,
    roles: [...roles].sort(),
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

export type FeatureCheck =
  | { ok: true }
  | { ok: false; reason: FeatureBlockReason; missingRoles: string[]; message: string };

/** Vérifie qu'une fonctionnalité est activée et que ses permissions sont consenties. */
export async function checkFeature(
  feature: IntegrationFeature,
  settings: IntegrationSettings,
): Promise<FeatureCheck> {
  const report = await getCapabilityReport(settings);
  const capability = report.features[feature];
  if (capability.usable) return { ok: true };
  const reason = capability.reason ?? "disabled";
  const messages: Record<FeatureBlockReason, string> = {
    disabled: "Fonctionnalité désactivée dans l'administration (Microsoft Teams & Copilot).",
    not_configured: `Microsoft Graph non configuré ou jeton refusé${report.tokenError ? ` : ${report.tokenError}` : ""}.`,
    missing_roles: `Permissions d'application manquantes (consentement administrateur requis) : ${capability.missingRoles.join(", ")}.`,
    bot_token: `Jeton Bot Framework indisponible${report.bot.error ? ` : ${report.bot.error}` : ""}.`,
  };
  return { ok: false, reason, missingRoles: capability.missingRoles, message: messages[reason] };
}
