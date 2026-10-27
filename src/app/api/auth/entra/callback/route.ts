import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { toSessionUser } from "@/lib/auth/permissions";
import { createSession } from "@/lib/auth/session";
import {
  ENTRA_TX_COOKIE,
  exchangeCodeForIdToken,
  getEntraConfig,
  readTransaction,
  validateIdToken,
} from "@/lib/auth/entra";
import { resolveEntraLogin } from "@/lib/db/store";
import { getPublicUrl } from "@/lib/env";

function loginRedirect(error: string): NextResponse {
  const response = NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(error)}`, getPublicUrl()),
  );
  response.cookies.delete({ name: ENTRA_TX_COOKIE, path: "/api/auth/entra" });
  return response;
}

/** Retour d'Entra : vérifie state, échange le code (PKCE), valide le jeton, ouvre la session. */
export async function GET(request: Request) {
  const config = getEntraConfig();
  if (!config) return loginRedirect("entra_disabled");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    console.warn(
      `[entra] Erreur d'autorisation : ${url.searchParams.get("error")} ${url.searchParams.get("error_description") ?? ""}`,
    );
    return loginRedirect("entra_failed");
  }

  const cookieStore = await cookies();
  const tx = readTransaction(cookieStore.get(ENTRA_TX_COOKIE)?.value);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!tx || !code || !state || state !== tx.state) {
    return loginRedirect("entra_state");
  }

  try {
    const idToken = await exchangeCodeForIdToken(config, code, tx.verifier);
    const claims = await validateIdToken(config, idToken, tx.nonce);

    if (claims._claim_names?.groups) {
      console.warn(
        `[entra] Dépassement de groupes (overage) pour ${claims.oid} : les correspondances par groupe nécessitent GroupMember.Read.All.`,
      );
    }

    const result = await resolveEntraLogin({
      oid: claims.oid,
      tenantId: claims.tid,
      email: claims.email ?? claims.preferred_username ?? claims.upn ?? "",
      name: claims.name ?? claims.preferred_username ?? "",
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      groups: Array.isArray(claims.groups) ? claims.groups : [],
    });

    if (!result.ok) return loginRedirect(`entra_${result.reason}`);

    await createSession(toSessionUser(result.user));
    const response = NextResponse.redirect(new URL(tx.redirect, getPublicUrl()));
    response.cookies.delete({ name: ENTRA_TX_COOKIE, path: "/api/auth/entra" });
    return response;
  } catch (error) {
    console.warn(
      `[entra] Connexion refusée : ${error instanceof Error ? error.message : String(error)}`,
    );
    return loginRedirect("entra_failed");
  }
}
