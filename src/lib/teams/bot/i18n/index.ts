import { DEFAULT_LOCALE, toIntlLocale, type Locale } from "@/lib/i18n/config";
import { getTranslator, interpolate, tDynamic, type TranslationValues } from "@/lib/i18n/translate";
import type { BudgetStatus, HermesPhaseId, ProjectStatus, TaskStatus } from "@/types";
import de from "./de";
import en from "./en";
import es from "./es";
import fr, { type BotMessages } from "./fr";
import it from "./it";

export type { BotMessages };

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type BotMessageKey = Paths<BotMessages>;

export type BotTranslator = (key: BotMessageKey, values?: TranslationValues) => string;

const DICTIONARIES: Record<Locale, BotMessages> = { fr, en, it, es, de };

export function getBotMessages(locale: Locale): BotMessages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function lookup(messages: BotMessages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Traductions du bot + libellés métier (phases, statuts) et formats de la langue choisie. */
export interface BotI18n {
  locale: Locale;
  t: BotTranslator;
  phase: (phase: HermesPhaseId) => string;
  projectStatus: (status: ProjectStatus) => string;
  taskStatus: (status: TaskStatus) => string;
  budgetStatus: (status: BudgetStatus) => string;
  /** Date (AAAA-MM-JJ ou ISO) au format local ; chaîne vide si absente. */
  date: (value: string | undefined) => string;
  money: (amount: number) => string;
}

export function getBotI18n(locale: Locale): BotI18n {
  const messages = getBotMessages(locale);
  const app = getTranslator(locale);
  const intl = toIntlLocale(locale);
  const dayOnly = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" });
  const instant = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "Europe/Zurich" });
  const moneyFormat = new Intl.NumberFormat(intl, { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
  return {
    locale,
    t: (key, values) => interpolate(lookup(messages, key) ?? lookup(fr, key) ?? key, values),
    phase: (phase) => tDynamic(app, `enums.phase.${phase}`),
    projectStatus: (status) => tDynamic(app, `enums.projectStatus.${status}`),
    taskStatus: (status) => tDynamic(app, `enums.taskStatus.${status}`),
    budgetStatus: (status) => tDynamic(app, `enums.budgetStatus.${status}`),
    date: (value) => {
      if (!value) return "";
      const isDay = value.length === 10;
      const parsed = new Date(isDay ? `${value}T00:00:00Z` : value);
      if (Number.isNaN(parsed.getTime())) return value;
      return (isDay ? dayOnly : instant).format(parsed);
    },
    money: (amount) => moneyFormat.format(amount),
  };
}
