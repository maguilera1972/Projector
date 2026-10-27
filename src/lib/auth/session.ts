import { cookies } from "next/headers";
import { isUserActive, toSessionUser, type SessionUser } from "@/lib/auth/permissions";
import { getUserByIdAny } from "@/lib/db/store";
import { createSessionToken, verifySessionToken } from "@/lib/auth/token";
import { useSecureCookies } from "@/lib/env";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { localeCookieOptions } from "@/lib/i18n/server";

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
  if (user.locale) {
    cookieStore.set(LOCALE_COOKIE, user.locale, localeCookieOptions());
  }
}

/**
 * Session ouverte dans un cadre tiers (onglet Microsoft Teams) : même cookie, mais
 * `SameSite=None; Secure` et partitionné (CHIPS) pour survivre au blocage des cookies tiers.
 */
export async function createEmbeddedSession(user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    secure: true,
    sameSite: "none",
    partitioned: true,
  });
  if (user.locale) {
    cookieStore.set(LOCALE_COOKIE, user.locale, {
      ...localeCookieOptions(),
      secure: true,
      sameSite: "none",
      partitioned: true,
    });
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: COOKIE_NAME, path: "/" });
}

/**
 * Utilisateur de la session courante, relu en base à chaque requête : un changement
 * de rôle, de permissions ou une suspension s'applique immédiatement, sans reconnexion.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  const current = await getUserByIdAny(session.id);
  if (!current || !isUserActive(current)) return null;
  return toSessionUser(current);
}
