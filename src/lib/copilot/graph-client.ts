import { getAppToken, GraphError, type GraphResponse } from "@/lib/integrations/graph";

/**
 * Requêtes Graph du connecteur, avec reprise sur limitation (429 / 503 / 504, en-tête Retry-After).
 * graphRequest ne transmet pas les en-têtes d'une réponse en erreur, d'où ce client dédié.
 */

const GRAPH_V1 = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 4;
const MAX_DELAY_MS = 60_000;

export type ConnectorMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_DELAY_MS);
  const date = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS);
  return Math.min(1000 * 2 ** attempt, MAX_DELAY_MS);
}

/** Seules les URL Graph sont acceptées (les URL d'opération stockées reçoivent le jeton d'application). */
export function isGraphUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "graph.microsoft.com";
  } catch {
    return false;
  }
}

export async function connectorRequest<T = unknown>(
  method: ConnectorMethod,
  pathOrUrl: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<GraphResponse<T>> {
  const url = /^https:\/\//.test(pathOrUrl)
    ? pathOrUrl
    : `${GRAPH_V1}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  if (!isGraphUrl(url)) throw new GraphError("URL Graph refusée.", 400, "invalidUrl");

  for (let attempt = 0; ; attempt++) {
    const token = await getAppToken();
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

    const throttled = response.status === 429 || response.status === 503 || response.status === 504;
    if (throttled && attempt < MAX_RETRIES) {
      await response.arrayBuffer().catch(() => undefined);
      await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
      continue;
    }

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
}

/** Exécute `worker` sur chaque élément avec une concurrence bornée (ordre des résultats conservé). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
