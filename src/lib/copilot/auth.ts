import type { SessionUser } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { getIntegrationSettings } from "@/lib/db/store";
import { resolveUserByEntraOid } from "@/lib/integrations/actions";
import {
  COPILOT_READ_ROLE,
  COPILOT_USER_SCOPE,
  COPILOT_WRITE_ROLE,
  getAppCredentials,
  getCopilotApiAudiences,
} from "@/lib/integrations/config";
import { bearerToken, entraIssuers, entraJwksUri, JwtValidationError, verifyJwt } from "@/lib/integrations/jwt";

/**
 * Authentification de l'API Copilot :
 * - jeton Entra délégué (scp ∋ access_as_user) → utilisateur PROJECTOR lié par `oid` ;
 * - jeton d'application (roles ∋ Projector.Read.All | Projector.ReadWrite.All, sans scp) → lecture seule globale ;
 * - repli : cookie de session PROJECTOR (tests depuis le navigateur).
 */

export type CopilotPrincipal =
  | { kind: "user"; user: SessionUser; via: "bearer" | "session" }
  | { kind: "app"; appId: string; roles: string[] };

export type CopilotAuthResult =
  | { ok: true; principal: CopilotPrincipal }
  | { ok: false; status: 401 | 403 | 503; error: string; code: string };

interface EntraAccessToken {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  tid?: string;
  oid?: string;
  scp?: string;
  roles?: string[];
  appid?: string;
  azp?: string;
  idtyp?: string;
}

function deny(status: 401 | 403 | 503, code: string, error: string): CopilotAuthResult {
  return { ok: false, status, code, error };
}

async function authenticateBearer(token: string, tenantId: string): Promise<CopilotAuthResult> {
  let payload: EntraAccessToken;
  try {
    ({ payload } = await verifyJwt<EntraAccessToken>(token, {
      jwksUri: entraJwksUri(tenantId),
      issuers: entraIssuers(tenantId),
      audiences: getCopilotApiAudiences(),
    }));
  } catch (error) {
    const reason = error instanceof JwtValidationError ? error.message : "Validation du jeton impossible.";
    return deny(401, "invalid_token", `Jeton refusé : ${reason}`);
  }
  if (payload.tid?.toLowerCase() !== tenantId.toLowerCase()) {
    return deny(401, "invalid_token", "Jeton émis pour un autre locataire.");
  }

  const scopes = (payload.scp ?? "").split(" ").filter(Boolean);
  const roles = Array.isArray(payload.roles) ? payload.roles : [];

  if (scopes.length > 0) {
    if (!scopes.includes(COPILOT_USER_SCOPE)) {
      return deny(403, "insufficient_scope", `Portée « ${COPILOT_USER_SCOPE} » requise.`);
    }
    const user = await resolveUserByEntraOid(payload.oid);
    if (!user) {
      return deny(
        403,
        "user_not_linked",
        "Votre compte Microsoft n'est lié à aucun utilisateur PROJECTOR actif. " +
          "Connectez-vous une première fois à PROJECTOR avec Microsoft (ou demandez l'approbation de votre compte à un administrateur).",
      );
    }
    return { ok: true, principal: { kind: "user", user, via: "bearer" } };
  }

  const granted = roles.filter((role) => role === COPILOT_READ_ROLE || role === COPILOT_WRITE_ROLE);
  if (granted.length === 0) {
    return deny(
      403,
      "insufficient_role",
      `Rôle d'application « ${COPILOT_READ_ROLE} » ou « ${COPILOT_WRITE_ROLE} » requis (consentement administrateur).`,
    );
  }
  return {
    ok: true,
    principal: { kind: "app", appId: payload.azp ?? payload.appid ?? "inconnu", roles: granted },
  };
}

export async function authenticateCopilotRequest(request: Request): Promise<CopilotAuthResult> {
  const settings = await getIntegrationSettings();
  if (!settings.features.copilotApi) {
    return deny(503, "feature_disabled", "L'API Copilot est désactivée dans l'administration PROJECTOR.");
  }

  const token = bearerToken(request);
  if (token) {
    const credentials = getAppCredentials();
    if (!credentials) return deny(503, "not_configured", "Microsoft Entra non configuré sur ce serveur.");
    return authenticateBearer(token, credentials.tenantId);
  }

  const user = await getSessionUser();
  if (user) return { ok: true, principal: { kind: "user", user, via: "session" } };
  return deny(401, "missing_token", "Authentification requise : en-tête « Authorization: Bearer <jeton Entra> ».");
}

export function principalLabel(principal: CopilotPrincipal): string {
  switch (principal.kind) {
    case "user":
      return principal.user.name;
    case "app":
      return `Application ${principal.appId}`;
    default: {
      const exhaustive: never = principal;
      return exhaustive;
    }
  }
}
