import { getPublicUrl } from "@/lib/env";

/**
 * Configuration Microsoft 365 (Teams, bot, Copilot) lue dans l'environnement.
 * Toutes les briques réutilisent l'inscription d'application PROJECTOR (MS_GRAPH_* / ENTRA_*).
 */

/** ID (manifeste) de l'application Teams PROJECTOR — stable, distinct de l'ID d'application Entra. */
export const DEFAULT_TEAMS_APP_ID = "f800790d-3a30-4c4a-958e-f8fa4c8b9107";

export const DEFAULT_CONNECTOR_ID = "projectorprojects";

export interface AppCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Identifiants « client credentials » de l'application (Graph, Bot Connector). */
export function getAppCredentials(): AppCredentials | null {
  const tenantId = env("MS_GRAPH_TENANT_ID") ?? env("ENTRA_TENANT_ID");
  const clientId = env("MS_GRAPH_CLIENT_ID") ?? env("ENTRA_CLIENT_ID");
  const clientSecret = env("MS_GRAPH_CLIENT_SECRET") ?? env("ENTRA_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

/** Identifiants du bot (même inscription par défaut, bot mono-locataire). */
export function getBotCredentials(): AppCredentials | null {
  const base = getAppCredentials();
  const clientId = env("TEAMS_BOT_APP_ID") ?? base?.clientId;
  const clientSecret = env("TEAMS_BOT_APP_SECRET") ?? base?.clientSecret;
  const tenantId = env("TEAMS_BOT_TENANT_ID") ?? base?.tenantId;
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

export function getTeamsAppId(): string {
  return env("TEAMS_APP_ID") ?? DEFAULT_TEAMS_APP_ID;
}

/** ID de l'application dans le catalogue Teams de l'organisation (si connu par l'environnement). */
export function getTeamsAppCatalogIdFromEnv(): string | undefined {
  return env("TEAMS_APP_CATALOG_ID");
}

/** Boîte aux lettres organisatrice par défaut des réunions (repli : MAIL_FROM). */
export function getDefaultMeetingOrganizer(): string | undefined {
  return env("TEAMS_MEETING_ORGANIZER") ?? env("MAIL_FROM");
}

export function getMeetingTimeZone(): string {
  return env("TEAMS_MEETING_TIMEZONE") ?? "Europe/Zurich";
}

export function getConnectorId(): string {
  return env("COPILOT_CONNECTOR_ID") ?? DEFAULT_CONNECTOR_ID;
}

/** Groupe Entra de repli pour les ACL du connecteur (administrateurs PROJECTOR). */
export function getConnectorAdminGroupId(): string | undefined {
  return env("COPILOT_CONNECTOR_ADMIN_GROUP_ID");
}

/** Audiences acceptées pour les jetons Bearer de l'API Copilot. */
export function getCopilotApiAudiences(): string[] {
  const credentials = getAppCredentials();
  const configured = (env("COPILOT_API_AUDIENCES") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!credentials) return configured;
  const host = new URL(getPublicBaseUrl()).hostname;
  return [
    ...new Set([
      credentials.clientId,
      `api://${credentials.clientId}`,
      `api://${host}/${credentials.clientId}`,
      ...configured,
    ]),
  ];
}

export const COPILOT_USER_SCOPE = "access_as_user";
export const COPILOT_READ_ROLE = "Projector.Read.All";
export const COPILOT_WRITE_ROLE = "Projector.ReadWrite.All";

/** Secret partagé des tâches planifiées (timer systemd → /api/integrations/jobs/run). */
export function getCronSecret(): string | undefined {
  return env("PROJECTOR_CRON_SECRET");
}

/** Intervalle (minutes) des tâches d'intégration en processus ; 0 ou absent = désactivé. */
export function getJobsIntervalMinutes(): number {
  const value = Number(env("PROJECTOR_JOBS_INTERVAL_MIN") ?? "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getPublicBaseUrl(): string {
  return getPublicUrl().replace(/\/$/, "");
}

/** Lien absolu vers une page PROJECTOR. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getPublicBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Lien profond Teams vers l'onglet personnel PROJECTOR, qui ouvre ensuite `path` dans l'onglet.
 * Repli sur l'URL web si l'application Teams n'est pas installée.
 */
export function teamsDeepLink(path: string, entityId = "projector-tasks"): string {
  const webUrl = absoluteUrl(path);
  const context = JSON.stringify({ subEntityId: path });
  return (
    `https://teams.microsoft.com/l/entity/${encodeURIComponent(getTeamsAppId())}/${encodeURIComponent(entityId)}` +
    `?webUrl=${encodeURIComponent(webUrl)}&context=${encodeURIComponent(context)}`
  );
}
