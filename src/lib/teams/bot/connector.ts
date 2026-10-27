import { getBotCredentials } from "@/lib/integrations/config";
import { BOT_FRAMEWORK_SCOPE, getAppToken } from "@/lib/integrations/graph";
import type { OutgoingActivity } from "./types";

/**
 * Client REST du Bot Connector (Bot Framework v3), sans SDK.
 * Le jeton du bot n'est envoyé qu'à un serviceUrl de la liste d'autorisation ci-dessous ;
 * l'appelant doit en outre ne transmettre qu'un serviceUrl authentifié (claim du jeton entrant)
 * ou issu d'une référence de conversation enregistrée après une telle authentification.
 */

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

/** Domaines Microsoft sous lesquels un hôte « smba.* » est accepté (clouds commerciaux et souverains). */
const SMBA_PARENT_DOMAINS = [".microsoft.com", ".microsoft.us"];

/**
 * Liste d'autorisation des serviceUrl (protection SSRF / fuite du jeton) :
 * - https://smba.trafficmanager.net/… (Teams, tous les points régionaux) ;
 * - https://*.botframework.com/… ;
 * - https://smba.<…> sous un domaine Microsoft (ex. smba.infra.gcc.teams.microsoft.com).
 * HTTPS uniquement, port par défaut, sans identifiants dans l'URL.
 */
export function isAllowedServiceUrl(serviceUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (host === "smba.trafficmanager.net") return true;
  if (host.endsWith(".botframework.com")) return true;
  return host.startsWith("smba.") && SMBA_PARENT_DOMAINS.some((suffix) => host.endsWith(suffix));
}

/** Compare deux serviceUrl (la barre oblique finale est facultative). */
export function sameServiceUrl(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
}

function endpoint(serviceUrl: string, path: string): string {
  if (!isAllowedServiceUrl(serviceUrl)) {
    throw new ConnectorError("serviceUrl non autorisé.", 400);
  }
  return `${serviceUrl.replace(/\/+$/, "")}${path}`;
}

async function connectorRequest<T>(
  method: "POST" | "PUT",
  serviceUrl: string,
  path: string,
  body: unknown,
): Promise<T> {
  const url = endpoint(serviceUrl, path);
  const token = await getAppToken(BOT_FRAMEWORK_SCOPE, getBotCredentials());
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const data = JSON.parse(text) as { error?: { code?: string; message?: string }; message?: string };
      detail = `${data.error?.code ?? ""} ${data.error?.message ?? data.message ?? ""}`.trim();
    } catch {
      detail = text.slice(0, 200);
    }
    throw new ConnectorError(`Bot Connector ${response.status} ${detail}`.trim(), response.status);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export interface ResourceResponse {
  id?: string;
}

const conversationPath = (conversationId: string) =>
  `/v3/conversations/${encodeURIComponent(conversationId)}/activities`;

/** Répond à une activité (fil de discussion dans un canal). */
export function replyToActivity(
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  activity: OutgoingActivity,
): Promise<ResourceResponse> {
  return connectorRequest(
    "POST",
    serviceUrl,
    `${conversationPath(conversationId)}/${encodeURIComponent(activityId)}`,
    activity,
  );
}

/** Envoie une activité à la fin d'une conversation existante. */
export function sendToConversation(
  serviceUrl: string,
  conversationId: string,
  activity: OutgoingActivity,
): Promise<ResourceResponse> {
  return connectorRequest("POST", serviceUrl, conversationPath(conversationId), activity);
}

/** Remplace une activité envoyée par le bot (mise à jour d'une carte). */
export function updateActivity(
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  activity: OutgoingActivity,
): Promise<ResourceResponse> {
  return connectorRequest(
    "PUT",
    serviceUrl,
    `${conversationPath(conversationId)}/${encodeURIComponent(activityId)}`,
    activity,
  );
}

export interface ConversationResourceResponse {
  id?: string;
  activityId?: string;
  serviceUrl?: string;
}

/** Nouveau fil dans un canal Teams (le bot doit être installé dans l'équipe). */
export function createChannelThread(
  serviceUrl: string,
  params: { botId: string; channelId: string; tenantId?: string; activity: OutgoingActivity },
): Promise<ConversationResourceResponse> {
  return connectorRequest("POST", serviceUrl, "/v3/conversations", {
    isGroup: true,
    bot: { id: params.botId },
    channelData: {
      channel: { id: params.channelId },
      ...(params.tenantId ? { tenant: { id: params.tenantId } } : {}),
    },
    ...(params.tenantId ? { tenantId: params.tenantId } : {}),
    activity: params.activity,
  });
}

/**
 * Conversation personnelle (1:1) avec un utilisateur : `userId` = « 29:… » ou aadObjectId.
 * Teams exige que l'application soit installée pour l'utilisateur ou dans une équipe dont il est membre.
 */
export function createPersonalConversation(
  serviceUrl: string,
  params: { botId: string; userId: string; tenantId?: string; activity?: OutgoingActivity },
): Promise<ConversationResourceResponse> {
  return connectorRequest("POST", serviceUrl, "/v3/conversations", {
    isGroup: false,
    bot: { id: params.botId },
    members: [{ id: params.userId }],
    ...(params.tenantId ? { tenantId: params.tenantId, channelData: { tenant: { id: params.tenantId } } } : {}),
    ...(params.activity ? { activity: params.activity } : {}),
  });
}
