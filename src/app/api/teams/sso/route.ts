import { NextResponse } from "next/server";
import { toSessionUser } from "@/lib/auth/permissions";
import { createEmbeddedSession } from "@/lib/auth/session";
import { getEntraConfig } from "@/lib/auth/entra";
import { resolveEntraLogin } from "@/lib/db/store";
import {
  COPILOT_USER_SCOPE,
  getAppCredentials,
  getCopilotApiAudiences,
} from "@/lib/integrations/config";
import {
  entraIssuers,
  entraJwksUri,
  JwtValidationError,
  verifyJwt,
} from "@/lib/integrations/jwt";
import {
  DEFAULT_TAB_PATH,
  safeRedirectPath,
  type TeamsSsoErrorCode,
  type TeamsSsoResponse,
} from "@/lib/teams/tab/sso";

/** Revendications utiles d'un jeton d'accès Entra (v1 ou v2) émis pour l'onglet Teams. */
interface TeamsSsoClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  tid?: string;
  oid?: string;
  scp?: string;
  roles?: string[];
  groups?: string[];
  name?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
  email?: string;
}

const STATUS: Record<TeamsSsoErrorCode, number> = {
  invalid_request: 400,
  sso_not_configured: 409,
  entra_disabled: 403,
  invalid_token: 401,
  wrong_tenant: 403,
  missing_scope: 403,
  denied: 403,
  pending: 403,
  suspended: 403,
  server_error: 500,
};

const MESSAGES: Record<TeamsSsoErrorCode, string> = {
  invalid_request: "Jeton Teams manquant.",
  sso_not_configured: "Authentification unique Teams non configurée (identifiants Entra absents).",
  entra_disabled: "La connexion Microsoft est désactivée.",
  invalid_token: "Jeton Teams invalide.",
  wrong_tenant: "Locataire Microsoft 365 non autorisé.",
  missing_scope: `Étendue ${COPILOT_USER_SCOPE} absente du jeton.`,
  denied: "Compte Microsoft non autorisé sur PROJECTOR.",
  pending: "Compte en attente d'approbation par un administrateur.",
  suspended: "Compte PROJECTOR suspendu.",
  server_error: "Erreur interne lors de la connexion Teams.",
};

function fail(code: TeamsSsoErrorCode): NextResponse<TeamsSsoResponse> {
  return NextResponse.json({ ok: false, code, error: MESSAGES[code] }, { status: STATUS[code] });
}

/**
 * Authentification unique de l'onglet Teams : valide le jeton `getAuthToken()` (Entra, étendue
 * access_as_user), relie le compte PROJECTOR comme la connexion Microsoft, puis ouvre une session
 * utilisable dans l'iframe Teams. Les jetons ne sont jamais journalisés.
 */
export async function POST(request: Request) {
  let body: { token?: unknown; redirect?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; redirect?: unknown };
  } catch {
    return fail("invalid_request");
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return fail("invalid_request");

  const credentials = getAppCredentials();
  if (!credentials) return fail("sso_not_configured");
  if (!getEntraConfig()) return fail("entra_disabled");
  const tenantId = credentials.tenantId;

  let claims: TeamsSsoClaims;
  try {
    const verified = await verifyJwt<TeamsSsoClaims>(token, {
      jwksUri: entraJwksUri(tenantId),
      issuers: entraIssuers(tenantId),
      audiences: getCopilotApiAudiences(),
    });
    claims = verified.payload;
  } catch (error) {
    console.warn(
      `[teams-sso] Jeton refusé : ${error instanceof JwtValidationError ? error.message : "erreur de validation"}`,
    );
    return fail("invalid_token");
  }

  if (claims.tid?.toLowerCase() !== tenantId.toLowerCase()) return fail("wrong_tenant");
  const scopes = (claims.scp ?? "").split(" ").filter(Boolean);
  if (!scopes.includes(COPILOT_USER_SCOPE)) return fail("missing_scope");
  if (!claims.oid) return fail("invalid_token");

  try {
    const email = claims.preferred_username ?? claims.upn ?? claims.email ?? claims.unique_name ?? "";
    const result = await resolveEntraLogin({
      oid: claims.oid,
      tenantId: claims.tid,
      email,
      name: claims.name ?? email,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      groups: Array.isArray(claims.groups) ? claims.groups : [],
    });
    if (!result.ok) return fail(result.reason);

    await createEmbeddedSession(toSessionUser(result.user));
    const redirect = safeRedirectPath(body.redirect) ?? DEFAULT_TAB_PATH;
    return NextResponse.json<TeamsSsoResponse>({ ok: true, redirect });
  } catch (error) {
    console.warn(
      `[teams-sso] Échec de la connexion : ${error instanceof Error ? error.message : String(error)}`,
    );
    return fail("server_error");
  }
}
