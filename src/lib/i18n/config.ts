export const LOCALES = ["fr", "en", "it", "es", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_COOKIE = "projector-locale";

/** Libellé de chaque langue dans sa propre langue (sélecteurs). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  it: "Italiano",
  es: "Español",
  de: "Deutsch",
};

const INTL_LOCALES: Record<Locale, string> = {
  fr: "fr-CH",
  en: "en-GB",
  it: "it-CH",
  es: "es-ES",
  de: "de-CH",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string") {
    const short = value.trim().slice(0, 2).toLowerCase();
    if (isLocale(short)) return short;
  }
  return DEFAULT_LOCALE;
}

export function toIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/** Choisit la meilleure langue supportée dans un en-tête Accept-Language. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const short = tag.slice(0, 2);
    if (isLocale(short)) return short;
  }
  return null;
}
