import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth/permissions";
import { createSessionToken, verifySessionToken } from "@/lib/auth/token";
import { useSecureCookies } from "@/lib/env";

const COOKIE_NAME = "projector-session";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, sessionCookieOptions());
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE_NAME, path: "/" });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
