import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { interpolate, type TranslationValues } from "@/lib/i18n/translate";
import de from "./de";
import en from "./en";
import es from "./es";
import fr, { type ReportMessages } from "./fr";
import it from "./it";

export type { ReportMessages };

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type ReportMessageKey = Paths<ReportMessages>;

export type ReportTranslator = (key: ReportMessageKey, values?: TranslationValues) => string;

const DICTIONARIES: Record<Locale, ReportMessages> = { fr, en, it, es, de };

export function getReportMessages(locale: Locale): ReportMessages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function lookup(messages: ReportMessages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function createReportTranslator(messages: ReportMessages): ReportTranslator {
  return (key, values) => interpolate(lookup(messages, key) ?? lookup(fr, key) ?? key, values);
}

export function getReportTranslator(locale: Locale): ReportTranslator {
  return createReportTranslator(getReportMessages(locale));
}

/** Clé construite dynamiquement (ex. `budget.revStatus.${status}`). */
export function rtDynamic(t: ReportTranslator, key: string, values?: TranslationValues): string {
  return t(key as ReportMessageKey, values);
}
