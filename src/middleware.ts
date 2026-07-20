import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSessionTokenValid } from "@/lib/auth/token";

const COOKIE_NAME = "projector-session";
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return isSessionTokenValid(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
