import { DEFAULT_LOCALE, type Locale } from "./config";
import de from "./messages/de";
import en from "./messages/en";
import es from "./messages/es";
import fr, { type Messages } from "./messages/fr";
import it from "./messages/it";

export type { Messages };

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type MessageKey = Paths<Messages>;

export type TranslationValues = Record<string, string | number>;

export type Translator = (key: MessageKey, values?: TranslationValues) => string;

const DICTIONARIES: Record<Locale, Messages> = { fr, en, it, es, de };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function createTranslator(messages: Messages): Translator {
  return (key, values) => {
    const template = lookup(messages, key) ?? lookup(fr, key) ?? key;
    return interpolate(template, values);
  };
}

export function getTranslator(locale: Locale): Translator {
  return createTranslator(getMessages(locale));
}

/** Traduit une clé dynamique (ex. `enums.phase.${id}`) sans casser le typage strict. */
export function tDynamic(t: Translator, key: string, values?: TranslationValues): string {
  return t(key as MessageKey, values);
}
