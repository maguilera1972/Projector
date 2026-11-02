import { isUserActive, type DbUser, type User } from "@/lib/auth/permissions";
import { normalizeLocale } from "@/lib/i18n/config";
import {
  getTeamsAppCatalogIdFromEnv,
  getTeamsAppId,
  teamsDeepLink,
} from "@/lib/integrations/config";
import {
  describeError,
  getAppTokenRoles,
  GraphError,
  graphRequest,
  odataString,
} from "@/lib/integrations/graph";
import { FEATURE_REQUIREMENTS } from "@/lib/integrations/capabilities";
import { renderNotification } from "@/lib/notifications/render";
import type { IntegrationSettings, Notification } from "@/types";

/**
 * Lot 1 — Notifications dans le flux d'activité Teams (Graph `TeamsActivity.Send`).
 * Pré-requis : application Teams PROJECTOR installée pour le destinataire (sinon Graph renvoie 403/404).
 */

export type TeamsFailureReason = "not_installed" | "bot_unavailable" | "no_teams" | "failed";

export type ActivityResult =
  | { ok: true; installedNow?: boolean }
  | { ok: false; reason: "no_entra" | "missing_role" | TeamsFailureReason; error: string };

/** Les préférences : e-mail par défaut, Teams par défaut si le compte est lié à Entra. */
export function wantsTeamsNotifications(user: Pick<User, "entraOid" | "teamsNotifications">): boolean {
  return Boolean(user.entraOid) && user.teamsNotifications !== false;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Catégorie d'une erreur Graph Teams :
 * - `bot_unavailable` : Teams ne peut pas créer la conversation 1:1 du bot déclaré dans le manifeste
 *   (« CreateThreadS2SRequest ») — ressource Azure Bot absente ; utiliser le paquet sans bot ;
 * - `no_teams` : utilisateur sans licence / non activé pour Teams ;
 * - `not_installed` : application PROJECTOR non installée pour l'utilisateur.
 */
export function classifyTeamsError(error: unknown): TeamsFailureReason {
  if (!(error instanceof GraphError)) return "failed";
  const text = error.message.toLowerCase();
  if (text.includes("createthread")) return "bot_unavailable";
  if (text.includes("licen") || text.includes("not enabled for teams") || text.includes("teams is not enabled")) {
    return "no_teams";
  }
  if (
    (error.status === 403 || error.status === 404 || error.status === 400) &&
    (text.includes("install") || text.includes("not found") || text.includes("teamsapp"))
  ) {
    return "not_installed";
  }
  return "failed";
}

const TEAMS_FAILURE_HINTS: Record<Exclude<TeamsFailureReason, "failed">, string> = {
  bot_unavailable:
    "Teams ne peut pas créer la conversation du bot PROJECTOR (ressource Azure Bot absente) : créez la ressource Azure Bot ou importez le paquet « sans bot » (projector-teams-sans-bot.zip).",
  no_teams: "Utilisateur sans licence Microsoft Teams ou non activé pour Teams.",
  not_installed: "Application PROJECTOR non installée pour cet utilisateur.",
};

export function describeTeamsFailure(reason: TeamsFailureReason, error: unknown): string {
  const detail = describeError(error);
  return reason === "failed" ? detail : `${TEAMS_FAILURE_HINTS[reason]} (${detail})`;
}

/** Recherche l'installation personnelle de l'app PROJECTOR (ID de catalogue). */
export async function findPersonalInstallation(
  userOid: string,
): Promise<{ installationId: string; catalogId: string } | null> {
  const filter = `teamsApp/externalId eq ${odataString(getTeamsAppId())}`;
  const { data } = await graphRequest<{
    value: { id: string; teamsApp?: { id: string; externalId?: string } }[];
  }>(
    "GET",
    `/users/${encodeURIComponent(userOid)}/teamwork/installedApps?$expand=teamsApp&$filter=${encodeURIComponent(filter)}`,
  );
  const match = data.value.find((item) => item.teamsApp?.externalId === getTeamsAppId());
  return match?.teamsApp ? { installationId: match.id, catalogId: match.teamsApp.id } : null;
}

/**
 * ID de l'application PROJECTOR dans le catalogue de l'organisation : depuis l'installation personnelle
 * de l'utilisateur, sinon depuis le catalogue (AppCatalog.Read.All, facultatif).
 */
export async function discoverCatalogId(
  userOid: string | undefined,
): Promise<{ catalogId: string; source: "installation" | "catalog" } | null> {
  if (userOid) {
    const installation = await findPersonalInstallation(userOid);
    if (installation) return { catalogId: installation.catalogId, source: "installation" };
  }
  const roles = await getAppTokenRoles();
  if (!roles.includes("AppCatalog.Read.All") && !roles.includes("AppCatalog.ReadWrite.All")) return null;
  const filter = `externalId eq ${odataString(getTeamsAppId())} and distributionMethod eq 'organization'`;
  const { data } = await graphRequest<{ value: { id: string }[] }>(
    "GET",
    `/appCatalogs/teamsApps?$filter=${encodeURIComponent(filter)}`,
  );
  return data.value[0] ? { catalogId: data.value[0].id, source: "catalog" } : null;
}

/** Installe l'app PROJECTOR pour l'utilisateur (TeamsAppInstallation.ReadWriteSelfForUser.All). */
export async function installPersonalApp(userOid: string, catalogId: string): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(userOid)}/teamwork/installedApps`, {
    body: {
      "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogId}`,
    },
  });
}

export type InstallOutcome =
  | { state: "installed" | "already" }
  | { state: "failed"; reason: TeamsFailureReason; error: string };

/** État d'installation par utilisateur (évite de retenter une installation impossible à chaque envoi). */
const installCache = new Map<string, { outcome: InstallOutcome; at: number; catalogId: string }>();
const INSTALL_FAILURE_TTL_MS = 6 * 3600_000;

/** Installe l'app pour l'utilisateur si nécessaire (résultat mis en cache). */
export async function ensurePersonalInstallation(
  userOid: string,
  catalogId: string,
  options: { force?: boolean } = {},
): Promise<InstallOutcome> {
  const key = userOid.toLowerCase();
  const cached = installCache.get(key);
  if (!options.force && cached && cached.catalogId === catalogId) {
    if (cached.outcome.state !== "failed" || Date.now() - cached.at < INSTALL_FAILURE_TTL_MS) return cached.outcome;
  }
  let outcome: InstallOutcome;
  try {
    if (await findPersonalInstallation(userOid)) {
      outcome = { state: "already" };
    } else {
      await installPersonalApp(userOid, catalogId);
      outcome = { state: "installed" };
    }
  } catch (error) {
    if (error instanceof GraphError && error.status === 409) {
      outcome = { state: "already" };
    } else {
      const reason = classifyTeamsError(error);
      outcome = { state: "failed", reason, error: describeTeamsFailure(reason, error) };
    }
  }
  installCache.set(key, { outcome, at: Date.now(), catalogId });
  return outcome;
}

async function postActivity(
  userOid: string,
  input: { title: string; message: string; href: string },
): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(userOid)}/teamwork/sendActivityNotification`, {
    body: {
      topic: {
        source: "text",
        value: "PROJECTOR",
        webUrl: teamsDeepLink(input.href),
      },
      activityType: "systemDefault",
      previewText: { content: truncate(input.message, 150) },
      templateParameters: [{ name: "systemDefaultText", value: truncate(input.title, 150) }],
    },
  });
}

/**
 * Envoie une activité Teams à un utilisateur Entra. Si l'app n'est pas installée pour lui et que l'ID
 * de catalogue est connu, l'installe automatiquement puis renvoie la notification une fois.
 */
export async function sendTeamsActivity(
  userOid: string | undefined,
  input: { title: string; message: string; href: string },
  settings?: Pick<IntegrationSettings, "teamsAppCatalogId">,
): Promise<ActivityResult> {
  if (!userOid) return { ok: false, reason: "no_entra", error: "Compte non lié à Microsoft Entra." };
  try {
    const roles = await getAppTokenRoles();
    if (!roles.includes("TeamsActivity.Send")) {
      return { ok: false, reason: "missing_role", error: "Permission TeamsActivity.Send absente du jeton." };
    }
    try {
      await postActivity(userOid, input);
      return { ok: true };
    } catch (error) {
      const reason = classifyTeamsError(error);
      if (reason !== "not_installed") return { ok: false, reason, error: describeTeamsFailure(reason, error) };
      const catalogId = settings?.teamsAppCatalogId ?? getTeamsAppCatalogIdFromEnv();
      const canInstall = FEATURE_REQUIREMENTS.activityFeed.optional[0].some((role) => roles.includes(role));
      if (!catalogId || !canInstall) {
        return { ok: false, reason, error: describeTeamsFailure(reason, error) };
      }
      const installation = await ensurePersonalInstallation(userOid, catalogId);
      if (installation.state === "failed") {
        return { ok: false, reason: installation.reason, error: installation.error };
      }
      await postActivity(userOid, input);
      return { ok: true, installedNow: installation.state === "installed" };
    }
  } catch (error) {
    const reason = classifyTeamsError(error);
    return { ok: false, reason, error: describeTeamsFailure(reason, error) };
  }
}

export interface BulkInstallReport {
  installed: string[];
  already: string[];
  failed: { name: string; reason: TeamsFailureReason; error: string }[];
  skipped: number;
}

/** Installe l'app PROJECTOR pour tous les comptes actifs liés à Entra (action d'administration). */
export async function installForAllUsers(users: User[], catalogId: string): Promise<BulkInstallReport> {
  const report: BulkInstallReport = { installed: [], already: [], failed: [], skipped: 0 };
  for (const user of users) {
    if (!user.entraOid || !isUserActive(user) || user.pendingApproval) {
      report.skipped += 1;
      continue;
    }
    const outcome = await ensurePersonalInstallation(user.entraOid, catalogId, { force: true });
    switch (outcome.state) {
      case "installed":
        report.installed.push(user.name);
        break;
      case "already":
        report.already.push(user.name);
        break;
      case "failed":
        report.failed.push({ name: user.name, reason: outcome.reason, error: outcome.error });
        break;
      default: {
        const exhaustive: never = outcome;
        throw new Error(String(exhaustive));
      }
    }
  }
  return report;
}

/** Diffuse les notifications PROJECTOR dans Teams selon les préférences de chaque destinataire. */
export function sendNotificationActivities(
  pending: Notification[],
  users: DbUser[],
  settings: IntegrationSettings,
): void {
  if (pending.length === 0 || !settings.features.activityFeed) return;
  const byId = new Map(users.map((user) => [user.id, user]));

  for (const notification of pending) {
    const recipient = byId.get(notification.userId);
    if (!recipient || !isUserActive(recipient) || !wantsTeamsNotifications(recipient)) continue;
    const rendered = renderNotification(notification, normalizeLocale(recipient.locale));
    void sendTeamsActivity(
      recipient.entraOid,
      { title: rendered.title, message: rendered.message, href: notification.href ?? "/" },
      settings,
    ).then((result) => {
      if (!result.ok && result.reason !== "missing_role" && result.reason !== "no_teams") {
        console.warn(
          `[teams] Activité ${notification.kind} non envoyée à ${recipient.email} : ${result.error}`,
        );
      }
    });
  }
}
