import { NextResponse } from "next/server";
import { useSecureCookies } from "@/lib/env";
import {
  buildAuthorizeUrl,
  createTransaction,
  ENTRA_TX_COOKIE,
  getEntraConfig,
} from "@/lib/auth/entra";
import { getPublicUrl } from "@/lib/env";

/** Démarre la connexion Microsoft : redirige vers Entra avec state, nonce et PKCE. */
export async function GET(request: Request) {
  const config = getEntraConfig();
  const base = getPublicUrl();
  if (!config) {
    return NextResponse.redirect(new URL("/login?error=entra_disabled", base));
  }

  const redirect = new URL(request.url).searchParams.get("redirect") ?? "/";
  const { tx, cookieValue, maxAge } = createTransaction(redirect);

  const response = NextResponse.redirect(buildAuthorizeUrl(config, tx));
  response.cookies.set(ENTRA_TX_COOKIE, cookieValue, {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax",
    path: "/api/auth/entra",
    maxAge,
  });
  return response;
}
