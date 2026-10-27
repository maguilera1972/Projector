import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { interpolate, type TranslationValues } from "@/lib/i18n/translate";
import de from "./de";
import en from "./en";
import es from "./es";
import fr, { type IntegrationMessages } from "./fr";
import it from "./it";

export type { IntegrationMessages };

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type IntegrationMessageKey = Paths<IntegrationMessages>;

export type IntegrationTranslator = (key: IntegrationMessageKey, values?: TranslationValues) => string;

const DICTIONARIES: Record<Locale, IntegrationMessages> = { fr, en, it, es, de };

function lookup(messages: IntegrationMessages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function getIntegrationTranslator(locale: Locale): IntegrationTranslator {
  const messages = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return (key, values) => interpolate(lookup(messages, key) ?? lookup(fr, key) ?? key, values);
}

/** Clé construite dynamiquement (ex. `features.${feature}.label`). */
export function itDynamic(t: IntegrationTranslator, key: string, values?: TranslationValues): string {
  return t(key as IntegrationMessageKey, values);
}
