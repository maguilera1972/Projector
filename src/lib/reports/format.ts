import { toIntlLocale, type Locale } from "@/lib/i18n/config";

const TIME_ZONE = "Europe/Zurich";

export interface ReportFormatter {
  date(value?: string): string;
  dateTime(value?: string): string;
  chf(value?: number): string;
  number(value?: number): string;
  percent(value?: number): string;
  signedDays(value?: number, unit?: string): string;
}

function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
}

export function createFormatter(locale: Locale, empty = "—"): ReportFormatter {
  const intl = toIntlLocale(locale);
  const dateFmt = new Intl.DateTimeFormat(intl, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
  const dateTimeFmt = new Intl.DateTimeFormat(intl, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
  const chfFmt = new Intl.NumberFormat(intl, {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  });
  const numFmt = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 });

  return {
    date: (value) => {
      if (!value) return empty;
      const parsed = parseDate(value);
      return Number.isNaN(parsed.getTime()) ? empty : dateFmt.format(parsed);
    },
    dateTime: (value) => {
      if (!value) return empty;
      const parsed = parseDate(value);
      return Number.isNaN(parsed.getTime()) ? empty : dateTimeFmt.format(parsed);
    },
    chf: (value) => (value === undefined || !Number.isFinite(value) ? empty : chfFmt.format(value)),
    number: (value) =>
      value === undefined || !Number.isFinite(value) ? empty : numFmt.format(value),
    percent: (value) =>
      value === undefined || !Number.isFinite(value) ? empty : `${Math.round(value)} %`,
    signedDays: (value, unit = "j") => {
      if (value === undefined) return empty;
      if (value === 0) return `0 ${unit}`;
      return `${value > 0 ? "+" : "−"}${Math.abs(value)} ${unit}`;
    },
  };
}

/** Date du jour (AAAA-MM-JJ) dans le fuseau d'affichage. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Vrai si la date (ISO, éventuellement horodatée) tombe dans la période (bornes incluses). */
export function inPeriod(value: string | undefined, from?: string, to?: string): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Maximum « rond » d'un axe de graphique, divisible en `ticks` graduations entières ou simples. */
export function niceAxisMax(value: number, ticks = 4): number {
  if (!Number.isFinite(value) || value <= 0) return ticks;
  const raw = value / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return Math.max(ticks, step * ticks);
}
