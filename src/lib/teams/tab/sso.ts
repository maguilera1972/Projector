/**
 * Contrat partagé (route `/api/teams/sso` ↔ pages d'onglet) : codes d'erreur et
 * chemins de redirection autorisés après l'authentification unique Teams.
 */

/** Codes renvoyés par `POST /api/teams/sso`. */
export type TeamsSsoErrorCode =
  | "invalid_request"
  | "sso_not_configured"
  | "entra_disabled"
  | "invalid_token"
  | "wrong_tenant"
  | "missing_scope"
  | "denied"
  | "pending"
  | "suspended"
  | "server_error";

/** Codes détectés côté navigateur (SDK Teams, réseau). */
export type TeamsClientErrorCode = "consent_required" | "token_failed" | "sdk_failed" | "network";

export type TeamsTabErrorCode = TeamsSsoErrorCode | TeamsClientErrorCode;

export type TeamsSsoResponse =
  | { ok: true; redirect: string }
  | { ok: false; code: TeamsSsoErrorCode; error: string };

export interface TeamsSsoRequest {
  token: string;
  /** Chemin PROJECTOR à ouvrir après connexion (validé côté serveur). */
  redirect?: string;
}

export const DEFAULT_TAB_PATH = "/taches";

/** Vues de l'onglet personnel (`/teams/tab?view=…`). */
export type TeamsTabView = "tasks" | "projects" | "reports" | "home";

export function isTeamsTabView(value: unknown): value is TeamsTabView {
  return value === "tasks" || value === "projects" || value === "reports" || value === "home";
}

export function viewPath(view: TeamsTabView): string {
  switch (view) {
    case "tasks":
      return "/taches";
    case "projects":
      return "/projets";
    case "reports":
      return "/rapports";
    case "home":
      return "/";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

/**
 * Chemin interne sûr (pas de redirection ouverte) : commence par « / » mais pas « // » ni « /\ »,
 * sans schéma, et hors des pages d'amorçage Teams et de l'API.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.length > 1024 || /[\u0000-\u001f]/.test(path) || path.includes("://")) return null;
  if (path === "/teams" || path.startsWith("/teams/") || path.startsWith("/api/")) return null;
  return path;
}

/** Associe les messages d'erreur du SDK (`authentication.getAuthToken`) à un code. */
export function classifyAuthTokenError(error: unknown): TeamsTabErrorCode {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (message.includes("consent")) return "consent_required";
  if (
    message.includes("invalid_resource") ||
    message.includes("resourcedisabled") ||
    message.includes("resource defined in manifest") ||
    message.includes("app resource")
  ) {
    return "sso_not_configured";
  }
  return "token_failed";
}
