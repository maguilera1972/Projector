/**
 * Validation générique de jetons JWT RS256 par JWKS (Bot Framework, Entra ID).
 * Sans dépendance : WebCrypto (RSASSA-PKCS1-v1_5 / SHA-256).
 */

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  /** Bot Framework : canaux autorisés à émettre avec cette clé (ex. « msteams »). */
  endorsements?: string[];
}

export interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export interface JwtVerifyOptions {
  jwksUri: string;
  issuers: string[];
  audiences: string[];
  clockSkewSec?: number;
}

export interface VerifiedJwt<T> {
  header: JwtHeader;
  payload: T;
  key: Jwk;
}

export class JwtValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtValidationError";
  }
}

const KEY_CACHE_MS = 24 * 3600_000;
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const metadataCache = new Map<string, { jwksUri: string; issuer?: string; fetchedAt: number }>();

/** Lit le document OpenID (jwks_uri, issuer), mis en cache 24 h. */
export async function getOpenIdMetadata(
  metadataUrl: string,
): Promise<{ jwksUri: string; issuer?: string }> {
  const cached = metadataCache.get(metadataUrl);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_MS) return cached;
  const response = await fetch(metadataUrl, { cache: "no-store" });
  if (!response.ok) throw new JwtValidationError(`Métadonnées OpenID indisponibles (${response.status}).`);
  const data = (await response.json()) as { jwks_uri?: string; issuer?: string };
  if (!data.jwks_uri) throw new JwtValidationError("jwks_uri absent des métadonnées OpenID.");
  const entry = { jwksUri: data.jwks_uri, issuer: data.issuer, fetchedAt: Date.now() };
  metadataCache.set(metadataUrl, entry);
  return entry;
}

async function getKey(jwksUri: string, kid: string): Promise<Jwk> {
  const cached = jwksCache.get(jwksUri);
  let key =
    cached && Date.now() - cached.fetchedAt < KEY_CACHE_MS
      ? cached.keys.find((item) => item.kid === kid)
      : undefined;
  if (!key) {
    const response = await fetch(jwksUri, { cache: "no-store" });
    if (!response.ok) throw new JwtValidationError(`JWKS indisponible (${response.status}).`);
    const data = (await response.json()) as { keys: Jwk[] };
    jwksCache.set(jwksUri, { keys: data.keys, fetchedAt: Date.now() });
    key = data.keys.find((item) => item.kid === kid);
  }
  if (!key) throw new JwtValidationError("Clé de signature inconnue (kid).");
  return key;
}

function decodeSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf-8")) as T;
  } catch {
    throw new JwtValidationError("Segment JWT illisible.");
  }
}

/** Décode sans vérifier (aiguillage selon l'émetteur avant validation complète). */
export function peekJwt<T = Record<string, unknown>>(token: string): { header: JwtHeader; payload: T } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return { header: decodeSegment<JwtHeader>(parts[0]), payload: decodeSegment<T>(parts[1]) };
  } catch {
    return null;
  }
}

export async function verifyJwt<
  T extends { iss?: string; aud?: string | string[]; exp?: number; nbf?: number },
>(token: string, options: JwtVerifyOptions): Promise<VerifiedJwt<T>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new JwtValidationError("Jeton mal formé.");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeSegment<JwtHeader>(headerB64);
  if (header.alg !== "RS256") throw new JwtValidationError(`Algorithme non supporté : ${header.alg}`);
  if (!header.kid) throw new JwtValidationError("kid absent.");

  const jwk = await getKey(options.jwksUri, header.kid);
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(signatureB64, "base64url"),
    Buffer.from(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new JwtValidationError("Signature invalide.");

  const payload = decodeSegment<T>(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  const skew = options.clockSkewSec ?? 300;
  if (!payload.iss || !options.issuers.includes(payload.iss)) {
    throw new JwtValidationError("Émetteur (iss) invalide.");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.some((aud) => options.audiences.includes(aud))) {
    throw new JwtValidationError("Audience (aud) invalide.");
  }
  if (!payload.exp || payload.exp + skew < now) throw new JwtValidationError("Jeton expiré.");
  if (payload.nbf && payload.nbf - skew > now) throw new JwtValidationError("Jeton pas encore valide.");

  return { header, payload, key: jwk };
}

/** Émetteurs Entra v1 et v2 d'un locataire. */
export function entraIssuers(tenantId: string): string[] {
  return [`https://login.microsoftonline.com/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`];
}

export function entraJwksUri(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
