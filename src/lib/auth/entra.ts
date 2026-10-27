import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getPublicUrl } from "@/lib/env";

/**
 * Connexion Microsoft Entra ID (OpenID Connect, flux « authorization code » + PKCE).
 * Configuration : ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET
 * (repli sur MS_GRAPH_* : même inscription d'application).
 */

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getEntraConfig(): EntraConfig | null {
  const tenantId = (process.env.ENTRA_TENANT_ID ?? process.env.MS_GRAPH_TENANT_ID)?.trim();
  const clientId = (process.env.ENTRA_CLIENT_ID ?? process.env.MS_GRAPH_CLIENT_ID)?.trim();
  const clientSecret = (
    process.env.ENTRA_CLIENT_SECRET ?? process.env.MS_GRAPH_CLIENT_SECRET
  )?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  if (process.env.ENTRA_LOGIN_ENABLED === "false") return null;
  return { tenantId, clientId, clientSecret, redirectUri: getEntraRedirectUri() };
}

export function isEntraLoginEnabled(): boolean {
  return getEntraConfig() !== null;
}

export function getEntraRedirectUri(): string {
  return (
    process.env.ENTRA_REDIRECT_URI?.trim() ||
    `${getPublicUrl().replace(/\/$/, "")}/api/auth/entra/callback`
  );
}

function authority(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}`;
}

export function expectedIssuer(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

// ─── Transaction (state / nonce / PKCE) signée, stockée en cookie httpOnly ──

export const ENTRA_TX_COOKIE = "projector-entra-tx";
const TX_MAX_AGE_SEC = 600;

export interface EntraTransaction {
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  exp: number;
}

function secret(): string {
  return process.env.PROJECTOR_SECRET ?? "projector-dev-secret-change-in-production";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createTransaction(redirect: string): {
  tx: EntraTransaction;
  cookieValue: string;
  maxAge: number;
} {
  const tx: EntraTransaction = {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    redirect: redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/",
    exp: Math.floor(Date.now() / 1000) + TX_MAX_AGE_SEC,
  };
  const payload = Buffer.from(JSON.stringify(tx)).toString("base64url");
  return { tx, cookieValue: `${payload}.${sign(payload)}`, maxAge: TX_MAX_AGE_SEC };
}

export function readTransaction(cookieValue: string | undefined): EntraTransaction | null {
  if (!cookieValue) return null;
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const tx = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as EntraTransaction;
    if (tx.exp < Math.floor(Date.now() / 1000)) return null;
    return tx;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(config: EntraConfig, tx: EntraTransaction): string {
  const challenge = createHash("sha256").update(tx.verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authority(config.tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForIdToken(
  config: EntraConfig,
  code: string,
  verifier: string,
): Promise<string> {
  const response = await fetch(`${authority(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
      scope: "openid profile email",
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.id_token) {
    throw new Error(
      `Échange du code refusé (${response.status}) ${data.error ?? ""} ${
        data.error_description?.split("\r\n")[0] ?? ""
      }`.trim(),
    );
  }
  return data.id_token;
}

// ─── Validation du jeton d'identité (signature JWKS, iss, aud, exp, nonce) ──

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let jwksCache: { uri: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function getSigningKey(tenantId: string, kid: string): Promise<Jwk> {
  const uri = `${authority(tenantId)}/discovery/v2.0/keys`;
  const fresh = jwksCache && jwksCache.uri === uri && Date.now() - jwksCache.fetchedAt < 3_600_000;
  let key = fresh ? jwksCache!.keys.find((item) => item.kid === kid) : undefined;
  if (!key) {
    const response = await fetch(uri, { cache: "no-store" });
    if (!response.ok) throw new Error(`JWKS indisponible (${response.status})`);
    const data = (await response.json()) as { keys: Jwk[] };
    jwksCache = { uri, keys: data.keys, fetchedAt: Date.now() };
    key = data.keys.find((item) => item.kid === kid);
  }
  if (!key) throw new Error("Clé de signature inconnue (kid).");
  return key;
}

export interface EntraIdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  nbf?: number;
  nonce?: string;
  oid: string;
  tid: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  roles?: string[];
  groups?: string[];
  _claim_names?: { groups?: string };
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf-8")) as T;
}

export async function validateIdToken(
  config: EntraConfig,
  idToken: string,
  expectedNonce: string,
): Promise<EntraIdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Jeton d'identité mal formé.");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeSegment<{ alg: string; kid: string }>(headerB64);
  if (header.alg !== "RS256") throw new Error(`Algorithme non supporté : ${header.alg}`);

  const jwk = await getSigningKey(config.tenantId, header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(signatureB64, "base64url"),
    Buffer.from(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("Signature du jeton invalide.");

  const claims = decodeSegment<EntraIdTokenClaims>(payloadB64);
  const now = Math.floor(Date.now() / 1000);
  const skew = 300;

  if (claims.tid !== config.tenantId) throw new Error("Locataire (tid) inattendu.");
  if (claims.iss !== expectedIssuer(config.tenantId)) throw new Error("Émetteur (iss) invalide.");
  if (claims.aud !== config.clientId) throw new Error("Audience (aud) invalide.");
  if (claims.exp + skew < now) throw new Error("Jeton expiré.");
  if (claims.nbf && claims.nbf - skew > now) throw new Error("Jeton pas encore valide.");
  if (!claims.nonce || claims.nonce !== expectedNonce) throw new Error("Nonce invalide.");
  if (!claims.oid) throw new Error("Claim oid manquant.");

  return claims;
}
