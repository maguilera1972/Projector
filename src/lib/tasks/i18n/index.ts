import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { interpolate, type TranslationValues } from "@/lib/i18n/translate";
import de from "./de";
import en from "./en";
import es from "./es";
import fr, { type TaskMessages } from "./fr";
import it from "./it";

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type TaskMessageKey = Paths<TaskMessages>;

export type TaskTranslator = (key: TaskMessageKey, values?: TranslationValues) => string;

const DICTIONARIES: Record<Locale, TaskMessages> = { fr, en, it, es, de };

function lookup(messages: TaskMessages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function getTaskTranslator(locale: Locale): TaskTranslator {
  const messages = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return (key, values) => interpolate(lookup(messages, key) ?? lookup(fr, key) ?? key, values);
}

/** Message d'erreur traduit à partir du code renvoyé par l'API, sinon du texte brut. */
export function taskErrorMessage(
  t: TaskTranslator,
  payload: { code?: string; error?: string } | null | undefined,
): string {
  if (payload?.code && lookup(fr, `errors.${payload.code}`)) {
    return t(`errors.${payload.code}` as TaskMessageKey);
  }
  return payload?.error || t("errors.generic");
}
