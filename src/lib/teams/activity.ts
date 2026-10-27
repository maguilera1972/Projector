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
import { renderNotification } from "@/lib/notifications/render";
import type { IntegrationSettings, Notification } from "@/types";

/**
 * Lot 1 — Notifications dans le flux d'activité Teams (Graph `TeamsActivity.Send`).
 * Pré-requis : application Teams PROJECTOR installée pour le destinataire (sinon Graph renvoie 403/404).
 */

export type ActivityResult =
  | { ok: true; installedNow?: boolean }
  | { ok: false; reason: "no_entra" | "missing_role" | "not_installed" | "failed"; error: string };

/** Les préférences : e-mail par défaut, Teams par défaut si le compte est lié à Entra. */
export function wantsTeamsNotifications(user: Pick<User, "entraOid" | "teamsNotifications">): boolean {
  return Boolean(user.entraOid) && user.teamsNotifications !== false;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function isNotInstalledError(error: unknown): boolean {
  if (!(error instanceof GraphError)) return false;
  const text = error.message.toLowerCase();
  return (
    (error.status === 403 || error.status === 404 || error.status === 400) &&
    (text.includes("install") || text.includes("not found") || text.includes("teamsapp"))
  );
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

/** Installe l'app PROJECTOR pour l'utilisateur (TeamsAppInstallation.ReadWriteSelfForUser.All). */
export async function installPersonalApp(userOid: string, catalogId: string): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(userOid)}/teamwork/installedApps`, {
    body: {
      "teamsApp@odata.bind": `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogId}`,
    },
  });
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
 * Envoie une activité Teams à un utilisateur Entra. Si l'app n'est pas installée et que l'ID de
 * catalogue est connu, tente une installation automatique puis un nouvel essai.
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
      if (!isNotInstalledError(error)) throw error;
      const catalogId = settings?.teamsAppCatalogId ?? getTeamsAppCatalogIdFromEnv();
      if (!catalogId || !roles.includes("TeamsAppInstallation.ReadWriteSelfForUser.All")) {
        return { ok: false, reason: "not_installed", error: describeError(error) };
      }
      await installPersonalApp(userOid, catalogId);
      await postActivity(userOid, input);
      return { ok: true, installedNow: true };
    }
  } catch (error) {
    return {
      ok: false,
      reason: isNotInstalledError(error) ? "not_installed" : "failed",
      error: describeError(error),
    };
  }
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
      if (!result.ok && result.reason !== "missing_role") {
        console.warn(
          `[teams] Activité ${notification.kind} non envoyée à ${recipient.email} : ${result.error}`,
        );
      }
    });
  }
}
