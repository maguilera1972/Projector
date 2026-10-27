import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/permissions";
import type { ActionResult } from "@/lib/integrations/actions";
import { describeError } from "@/lib/integrations/graph";
import { authenticateCopilotRequest, type CopilotPrincipal } from "./auth";

/** Réponses JSON de l'API Copilot (jamais mises en cache : contenu dépendant de l'appelant). */

const NO_STORE = { "Cache-Control": "no-store" };

export function copilotJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function copilotError(status: number, error: string, code?: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, { status, headers: { ...NO_STORE, ...headers } });
}

function challenge(code: string): Record<string, string> {
  const error = code === "missing_token" ? "" : `, error="${code === "insufficient_scope" ? "insufficient_scope" : "invalid_token"}"`;
  return { "WWW-Authenticate": `Bearer realm="PROJECTOR"${error}` };
}

/** Authentifie l'appel puis exécute `handler` ; toute exception devient une erreur 500 JSON. */
export async function withCopilot(
  request: Request,
  handler: (principal: CopilotPrincipal) => Promise<Response>,
): Promise<Response> {
  try {
    const auth = await authenticateCopilotRequest(request);
    if (!auth.ok) {
      const headers = auth.status === 401 || auth.code === "insufficient_scope" ? challenge(auth.code) : {};
      return copilotError(auth.status, auth.error, auth.code, headers);
    }
    return await handler(auth.principal);
  } catch (error) {
    console.error("[copilot-api]", describeError(error));
    return copilotError(500, "Erreur interne PROJECTOR.", "internal_error");
  }
}

/** Variante réservée aux utilisateurs délégués (actions, « mes tâches »). */
export async function withCopilotUser(
  request: Request,
  handler: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  return withCopilot(request, async (principal) => {
    switch (principal.kind) {
      case "user":
        return handler(principal.user);
      case "app":
        return copilotError(
          403,
          "Cette opération requiert un utilisateur délégué (jeton avec la portée access_as_user) : les jetons d'application sont en lecture seule.",
          "delegated_user_required",
        );
      default: {
        const exhaustive: never = principal;
        return exhaustive;
      }
    }
  });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function bodyText(body: Record<string, unknown>, key: string, max = 2000): string {
  const value = body[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Traduit un ActionResult (couche d'actions PROJECTOR) en réponse HTTP. */
export function actionResponse<T>(result: ActionResult<T>, onSuccess: (value: T) => unknown): NextResponse {
  if (!result.ok) return copilotError(result.status, result.error);
  return copilotJson(onSuccess(result.value));
}
