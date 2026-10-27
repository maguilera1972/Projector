import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSessionTokenValid } from "@/lib/auth/token";

const COOKIE_NAME = "projector-session";
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/entra/",
  "/invitation/",
  "/api/invitations/accept",
  "/api/i18n/locale",
  // Logos chargés par les clients mail, sans session.
  "/brand/",
  // Microsoft Teams / Copilot : authentification propre (JWT Bot Framework, jeton Entra, secret cron).
  "/api/teams/messages",
  "/api/teams/sso",
  "/teams/",
  "/api/copilot/",
  "/api/integrations/jobs/run",
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Le cookie de session posé par l'onglet Teams est SameSite=None : toute mutation d'API portant
 * ce cookie doit provenir de PROJECTOR lui-même (protection CSRF via Sec-Fetch-Site).
 */
function isCrossSiteMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith("/api/")) return false;
  if (!request.cookies.get(COOKIE_NAME)) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return isSessionTokenValid(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isCrossSiteMutation(request)) {
    return NextResponse.json({ error: "Requête intersite refusée." }, { status: 403 });
  }

  if (
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    if (pathname === "/login" && (await isAuthenticated(request))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!(await isAuthenticated(request))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon).*)"],
};
