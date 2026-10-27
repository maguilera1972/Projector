import { getAppCredentials, type AppCredentials } from "./config";

/**
 * Client Microsoft Graph minimal (fetch + jeton d'application « client credentials »).
 * Les secrets ne sont jamais journalisés ; les erreurs exposent uniquement code/message Graph.
 */

export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
export const BOT_FRAMEWORK_SCOPE = "https://api.botframework.com/.default";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_BETA = "https://graph.microsoft.com/beta";

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

export class NotConfiguredError extends Error {
  constructor(message = "Microsoft Graph non configuré (MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET).") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

/** Jeton d'application pour une ressource (Graph par défaut, Bot Framework…). */
export async function getAppToken(
  scope = GRAPH_SCOPE,
  credentials: AppCredentials | null = getAppCredentials(),
): Promise<string> {
  if (!credentials) throw new NotConfiguredError();
  const key = `${credentials.tenantId}:${credentials.clientId}:${scope}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope,
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new GraphError(
      `Jeton refusé (${response.status}) ${data.error ?? ""} ${data.error_description?.split("\r\n")[0] ?? ""}`.trim(),
      response.status,
      data.error,
    );
  }
  tokenCache.set(key, {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

let rolesCache: { roles: string[]; fetchedAt: number } | null = null;

/** Rôles d'application (permissions Graph consenties) présents dans le jeton. */
export async function getAppTokenRoles(force = false): Promise<string[]> {
  if (!force && rolesCache && Date.now() - rolesCache.fetchedAt < 600_000) return rolesCache.roles;
  const token = await getAppToken();
  const roles = decodeJwtPayload<{ roles?: string[] }>(token)?.roles ?? [];
  rolesCache = { roles, fetchedAt: Date.now() };
  return roles;
}

export interface GraphResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export interface GraphRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  beta?: boolean;
}

/** Requête Graph authentifiée ; lève GraphError si le statut n'est pas 2xx. */
export async function graphRequest<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  pathOrUrl: string,
  options: GraphRequestOptions = {},
): Promise<GraphResponse<T>> {
  const token = await getAppToken();
  const url = /^https:\/\//.test(pathOrUrl)
    ? pathOrUrl
    : `${options.beta ? GRAPH_BETA : GRAPH_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new GraphError(
      `Graph ${response.status} ${error?.code ?? ""} ${error?.message ?? ""}`.trim(),
      response.status,
      error?.code,
      response.headers.get("request-id") ?? undefined,
    );
  }
  return { status: response.status, data: data as T, headers: response.headers };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Échappe une valeur pour un filtre OData ($filter). */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
