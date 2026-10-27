import { getBotCredentials } from "@/lib/integrations/config";
import {
  entraIssuers,
  entraJwksUri,
  getOpenIdMetadata,
  JwtValidationError,
  peekJwt,
  verifyJwt,
} from "@/lib/integrations/jwt";
import { isAllowedServiceUrl, sameServiceUrl } from "./connector";
import type { BotRequestAuth, IncomingActivity } from "./types";

/**
 * Authentification des requêtes Bot Connector → bot (Bearer JWT RS256, 5 min de tolérance d'horloge).
 *
 * Émetteurs acceptés (tout autre jeton est refusé) :
 * 1. Bot Connector — iss « https://api.botframework.com », clés de
 *    https://login.botframework.com/v1/.well-known/openidconfiguration, aud = ID d'application du bot,
 *    la clé de signature doit endosser le canal de l'activité (« msteams ») et le claim `serviceurl`,
 *    s'il est présent, doit être identique à `activity.serviceUrl`. C'est le cas de tout le trafic Teams,
 *    y compris pour une inscription Azure Bot mono-locataire.
 * 2. Jeton Entra du locataire (inscription mono-locataire : émulateur, appel bot à bot, outils internes) —
 *    iss v1/v2 du locataire, clés du locataire, aud = ID du bot, `tid` = locataire, et `azp`/`appid`
 *    = ID du bot lui-même. Sans cette dernière règle, n'importe quelle application du locataire pourrait
 *    obtenir un jeton « client credentials » pour le bot et usurper un utilisateur Teams.
 *
 * Le jeton du bot n'est renvoyé vers `activity.serviceUrl` que si celui-ci est authentifié
 * (claim égal, ou jeton émis pour nos propres identifiants) et figure dans la liste d'autorisation.
 */

const BOT_FRAMEWORK_OPENID_METADATA = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const CLOCK_SKEW_SEC = 300;

interface BotTokenClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  serviceurl?: string;
  serviceUrl?: string;
  tid?: string;
  azp?: string;
  appid?: string;
}

export class BotAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = "BotAuthError";
  }
}

/** Locataire déclaré par l'activité (Teams le place dans channelData et/ou conversation). */
function activityTenantIds(activity: IncomingActivity): string[] {
  return [activity.channelData?.tenant?.id, activity.conversation?.tenantId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

async function verifyBotFrameworkToken(
  token: string,
  activity: IncomingActivity,
  botAppId: string,
): Promise<boolean> {
  const { jwksUri } = await getOpenIdMetadata(BOT_FRAMEWORK_OPENID_METADATA);
  const { payload, key } = await verifyJwt<BotTokenClaims>(token, {
    jwksUri,
    issuers: [BOT_FRAMEWORK_ISSUER],
    audiences: [botAppId],
    clockSkewSec: CLOCK_SKEW_SEC,
  });
  if (!key.endorsements?.includes(activity.channelId)) {
    throw new JwtValidationError("Clé non endossée pour ce canal.");
  }
  const claimedServiceUrl = payload.serviceurl ?? payload.serviceUrl;
  if (claimedServiceUrl && !sameServiceUrl(claimedServiceUrl, activity.serviceUrl)) {
    throw new JwtValidationError("serviceUrl du jeton différent de celui de l'activité.");
  }
  return Boolean(claimedServiceUrl);
}

async function verifyTenantToken(token: string, tenantId: string, botAppId: string): Promise<void> {
  const { payload } = await verifyJwt<BotTokenClaims>(token, {
    jwksUri: entraJwksUri(tenantId),
    issuers: entraIssuers(tenantId),
    audiences: [botAppId],
    clockSkewSec: CLOCK_SKEW_SEC,
  });
  if (payload.tid?.toLowerCase() !== tenantId.toLowerCase()) {
    throw new JwtValidationError("Locataire (tid) invalide.");
  }
  const caller = payload.azp ?? payload.appid;
  if (caller?.toLowerCase() !== botAppId.toLowerCase()) {
    throw new JwtValidationError("Application appelante non autorisée.");
  }
}

/** Valide le jeton et la cohérence de l'activité ; lève BotAuthError (401/403/503) sinon. */
export async function authenticateBotRequest(
  token: string,
  activity: IncomingActivity,
): Promise<BotRequestAuth> {
  const credentials = getBotCredentials();
  if (!credentials) throw new BotAuthError("Bot non configuré.", 503);
  const { tenantId, clientId: botAppId } = credentials;

  const issuer = peekJwt<BotTokenClaims>(token)?.payload.iss;
  let auth: BotRequestAuth;
  try {
    if (issuer === BOT_FRAMEWORK_ISSUER) {
      const serviceUrlClaimed = await verifyBotFrameworkToken(token, activity, botAppId);
      auth = {
        issuerKind: "botframework",
        serviceUrlTrusted: serviceUrlClaimed && isAllowedServiceUrl(activity.serviceUrl),
        tenantId,
        botAppId,
      };
    } else if (issuer && entraIssuers(tenantId).includes(issuer)) {
      await verifyTenantToken(token, tenantId, botAppId);
      auth = {
        issuerKind: "entra",
        serviceUrlTrusted: isAllowedServiceUrl(activity.serviceUrl),
        tenantId,
        botAppId,
      };
    } else {
      throw new JwtValidationError("Émetteur non accepté.");
    }
  } catch (error) {
    if (error instanceof JwtValidationError) throw new BotAuthError(error.message, 401);
    throw new BotAuthError("Validation du jeton impossible.", 401);
  }

  const declared = activityTenantIds(activity);
  if (declared.some((id) => id.toLowerCase() !== tenantId.toLowerCase())) {
    throw new BotAuthError("Locataire non autorisé.", 403);
  }
  return auth;
}
