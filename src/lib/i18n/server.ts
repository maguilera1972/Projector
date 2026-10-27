import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchAcceptLanguage,
  type Locale,
} from "./config";
import { getTranslator, type Translator } from "./translate";

/**
 * Langue de la requête courante : cookie de préférence (posé à la connexion
 * depuis le profil, ou via le sélecteur), sinon Accept-Language, sinon français.
 */
export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  return matchAcceptLanguage(headerStore.get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getRequestTranslator(): Promise<{
  locale: Locale;
  t: Translator;
}> {
  const locale = await getRequestLocale();
  return { locale, t: getTranslator(locale) };
}

export function localeCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export async function setLocaleCookie(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, localeCookieOptions());
}
